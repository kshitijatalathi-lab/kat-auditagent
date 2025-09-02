import os
import argparse
from dataclasses import dataclass
from typing import Dict, List

import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    DataCollatorForLanguageModeling,
    Trainer,
    TrainingArguments,
    BitsAndBytesConfig,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

# Note: install training deps from smartaudit/requirements-train.txt
# Torch should match your CUDA version.


@dataclass
class Sample:
    question: str
    context_blocks: List[Dict]
    expected_answer: str


def format_context_blocks(blocks: List[Dict]) -> str:
    lines = []
    for i, b in enumerate(blocks, start=1):
        source = b.get("source", f"block#{i}")
        text = b.get("text", "")
        lines.append(f"[#{i} {source}]\n{text}\n")
    return "\n".join(lines)


def build_supervised_example(q: str, blocks: List[Dict], answer: str) -> str:
    header = (
        "You are SmartAudit, an assistant for compliance and audit tasks. "
        "Answer the user's question strictly using ONLY the provided CONTEXT. "
        "You MUST include short citations that point to the context block numbers like [#1], [#2]. "
        "If the answer is not supported by the context, reply exactly: 'Not in context'.\n\n"
    )
    ctx = format_context_blocks(blocks)
    prompt = (
        f"{header}QUESTION: {q}\n\nCONTEXT:\n{ctx}\n\n"
        "INSTRUCTIONS:\n"
        "- Provide a concise, accurate answer.\n"
        "- Include short citations like [#1] referencing the context block IDs.\n"
        "- If the answer is not supported by the context, reply exactly: 'Not in context'.\n"
        "\nANSWER:\n"
    )
    return prompt + answer


def tokenize_function(examples, tokenizer, max_seq_len: int):
    return tokenizer(
        examples["text"],
        truncation=True,
        max_length=max_seq_len,
        padding=False,
    )


def main():
    parser = argparse.ArgumentParser(description="LoRA fine-tune SmartAudit agent")
    parser.add_argument("--base_model", type=str, default=os.getenv("BASE_MODEL", "Qwen/Qwen2.5-3B-Instruct"))
    parser.add_argument("--train_file", type=str, default="smartaudit/data/fine_tune/train.sample.jsonl")
    parser.add_argument("--val_file", type=str, default=None)
    parser.add_argument("--output_dir", type=str, default="./outputs/lora-smartaudit")
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--batch_size", type=int, default=1)
    parser.add_argument("--grad_accum", type=int, default=8)
    parser.add_argument("--max_seq_len", type=int, default=4096)
    parser.add_argument("--lora_r", type=int, default=16)
    parser.add_argument("--lora_alpha", type=int, default=32)
    parser.add_argument("--lora_dropout", type=float, default=0.05)
    parser.add_argument("--fp16", action="store_true")
    parser.add_argument("--load_in_4bit", action="store_true", help="Load base model in 4-bit quant (requires CUDA+bittandbytes)")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print("Loading base model ...")
    if args.load_in_4bit and device == "cuda":
        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
        )
        model = AutoModelForCausalLM.from_pretrained(
            args.base_model,
            device_map="auto",
            low_cpu_mem_usage=True,
            quantization_config=quant_config,
        )
    else:
        model = AutoModelForCausalLM.from_pretrained(
            args.base_model,
            torch_dtype=torch.float16 if args.fp16 else torch.float32,
            device_map="auto" if device == "cuda" else None,
            low_cpu_mem_usage=True,
        )

    # Prepare for LoRA
    model = prepare_model_for_kbit_training(model)
    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "v_proj"],
    )
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    # Load dataset
    ds = load_dataset("json", data_files={"train": args.train_file, "validation": args.val_file} if args.val_file else {"train": args.train_file})

    def map_to_text(batch):
        texts = []
        for q, blocks, ans in zip(batch["question"], batch["context_blocks"], batch["expected_answer"]):
            texts.append(build_supervised_example(q, blocks, ans))
        return {"text": texts}

    ds = ds.map(map_to_text, batched=True, remove_columns=ds["train"].column_names)

    tokenized = ds.map(lambda x: tokenize_function(x, tokenizer, args.max_seq_len), batched=True)

    data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        warmup_steps=100,
        logging_steps=10,
        evaluation_strategy="steps" if "validation" in tokenized else "no",
        eval_steps=100,
        save_steps=500,
        save_total_limit=2,
        bf16=(device == "cuda" and not args.fp16),
        fp16=args.fp16,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized.get("validation"),
        tokenizer=tokenizer,
        data_collator=data_collator,
    )

    trainer.train()
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    print("Training complete. Adapter saved to:", args.output_dir)


if __name__ == "__main__":
    main()
