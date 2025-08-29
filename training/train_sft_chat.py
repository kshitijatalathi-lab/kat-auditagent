#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from typing import Dict, List, Optional

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


# Render one conversation from messages -> plain text using tokenizer chat template
# Expects each example to have {"messages": [{"role": "user"|"assistant", "content": str}, ...]}

def render_conversation(tokenizer, messages: List[Dict], add_generation_prompt: bool = False) -> str:
    try:
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=add_generation_prompt,
        )
    except Exception:
        # Fallback: simple format if tokenizer lacks chat template
        lines = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            lines.append(f"<{role}>: {content}")
        return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="SFT chat JSONL using Transformers (optional LoRA/4-bit)")
    ap.add_argument("--base_model", type=str, required=True, help="HF model id, e.g. google/gemma-2-2b-it")
    ap.add_argument("--data_dir", type=str, required=True, help="Directory containing train.jsonl and optional val.jsonl")
    ap.add_argument("--output_dir", type=str, default="./outputs/sft-chat")
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--batch_size", type=int, default=1)
    ap.add_argument("--grad_accum", type=int, default=8)
    ap.add_argument("--max_seq_len", type=int, default=2048)
    ap.add_argument("--fp16", action="store_true")
    ap.add_argument("--load_in_4bit", action="store_true", help="Require CUDA + bitsandbytes")
    ap.add_argument("--lora", action="store_true", help="Enable LoRA adapters")
    ap.add_argument("--lora_r", type=int, default=16)
    ap.add_argument("--lora_alpha", type=int, default=32)
    ap.add_argument("--lora_dropout", type=float, default=0.05)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"

    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Model loading (optional 4-bit)
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

    if args.lora:
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

    # Load datasets
    data_files = {"train": os.path.join(args.data_dir, "train.jsonl")}
    val_path = os.path.join(args.data_dir, "val.jsonl")
    if os.path.exists(val_path):
        data_files["validation"] = val_path

    ds = load_dataset("json", data_files=data_files)

    # Map to raw text using chat template (include assistant text in labels for simplicity)
    def map_to_text(batch):
        texts = []
        for msgs in batch["messages"]:
            # Render fully without add_generation_prompt so that assistant text is present
            rendered = render_conversation(tokenizer, msgs, add_generation_prompt=False)
            texts.append(rendered)
        return {"text": texts}

    ds = ds.map(map_to_text, batched=True, remove_columns=ds["train"].column_names)

    # Tokenize
    def tok_fn(examples):
        return tokenizer(
            examples["text"],
            truncation=True,
            max_length=args.max_seq_len,
            padding=False,
        )

    tokenized = ds.map(tok_fn, batched=True)

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
    print(f"Training complete. Saved to: {args.output_dir}")


if __name__ == "__main__":
    main()
