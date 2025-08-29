from __future__ import annotations

from pathlib import Path
import argparse

try:
    from unsloth import FastLanguageModel  # type: ignore
except Exception as e:
    raise SystemExit("Please install unsloth: pip install unsloth") from e


def main():
    p = argparse.ArgumentParser(description="Test the fine-tuned SmartAudit Gemma model")
    p.add_argument("--model_dir", type=str, default=str(Path(__file__).resolve().parents[1] / "models" / "smartaudit-gemma"))
    p.add_argument("--prompt", type=str, default="<|user|>\nWhat should a company document for a GDPR compliance audit?\n<|assistant|>\n")
    p.add_argument("--max_new_tokens", type=int, default=200)
    args = p.parse_args()

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.model_dir,
        max_seq_length=2048,
        dtype=None,
        load_in_4bit=False,
    )

    inputs = tokenizer(args.prompt, return_tensors="pt")
    outputs = model.generate(**inputs, max_new_tokens=args.max_new_tokens)
    print(tokenizer.decode(outputs[0], skip_special_tokens=True))


if __name__ == "__main__":
    main()
