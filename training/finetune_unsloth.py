from __future__ import annotations

import os
from pathlib import Path
from datasets import load_dataset
from transformers import TrainingArguments
import torch

try:
    from unsloth import FastLanguageModel  # type: ignore
except Exception as e:
    raise SystemExit("Please install unsloth in a GPU environment: pip install unsloth") from e

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "fine_tune" / "audit_qa.jsonl"
OUTPUT_DIR = ROOT / "outputs"
MODEL_OUT = ROOT / "models" / "smartaudit-gemma"

# You can substitute with a 270M variant if available; using unsloth/gemma-3b as a placeholder per reference
BASE_MODEL = os.getenv("UNSLOTH_MODEL_NAME", "unsloth/gemma-3b")


def format_example(example: dict) -> str:
    return f"<|user|>\n{example['instruction']}\n<|assistant|>\n{example['response']}"


def main() -> None:
    if not torch.cuda.is_available():
        print("[WARN] CUDA/GPU not detected. Fine-tuning requires a GPU for practicality.")

    if not DATA_PATH.exists():
        raise SystemExit(f"Training data not found at {DATA_PATH}. Create it first.")

    print("Loading dataset...")
    dataset = load_dataset("json", data_files=str(DATA_PATH))["train"]
    dataset = dataset.map(lambda x: {"text": format_example(x)})

    print(f"Loading base model via Unsloth: {BASE_MODEL}")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=2048,
        dtype=torch.float16,
        load_in_4bit=True,
    )

    # Prepare model for supervised fine-tuning
    FastLanguageModel.prepare_for_training(model)

    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR),
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=10,
        learning_rate=2e-5,
        num_train_epochs=3,
        logging_steps=10,
        save_total_limit=1,
        bf16=torch.cuda.is_available(),
        optim="adamw_torch",
        report_to=[],
    )

    print("Starting fine-tuning...")
    model.train()
    model.fit(
        dataset=dataset,
        tokenizer=tokenizer,
        args=training_args,
    )

    print(f"Saving model to {MODEL_OUT} ...")
    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(MODEL_OUT))
    tokenizer.save_pretrained(str(MODEL_OUT))
    print("Done.")


if __name__ == "__main__":
    main()
