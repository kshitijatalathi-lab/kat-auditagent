#!/usr/bin/env python3
from __future__ import annotations

from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import torch, os, argparse


def main():
    ap = argparse.ArgumentParser(description="Merge a LoRA adapter into a base model and save merged weights")
    ap.add_argument("--base", required=True, help="Base HF model id, e.g., google/gemma-2-2b-it")
    ap.add_argument("--lora_dir", required=True, help="Directory with LoRA adapter (trainer output)")
    ap.add_argument("--out_dir", required=True, help="Output directory for merged model")
    ap.add_argument("--dtype", default="float16", choices=["float16", "bfloat16", "float32"])
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    dtype_map = {
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
        "float32": torch.float32,
    }
    torch_dtype = dtype_map[args.dtype]

    tok = AutoTokenizer.from_pretrained(args.base, use_fast=True)
    model = AutoModelForCausalLM.from_pretrained(
        args.base,
        torch_dtype=torch_dtype,
        device_map="auto",
        low_cpu_mem_usage=True,
    )
    model = PeftModel.from_pretrained(model, args.lora_dir)
    model = model.merge_and_unload()

    tok.save_pretrained(args.out_dir)
    model.save_pretrained(args.out_dir)
    print("Merged model saved to", args.out_dir)


if __name__ == "__main__":
    main()
