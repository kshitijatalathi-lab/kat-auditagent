#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description="Split chat JSONL (messages) into train/val")
    p.add_argument("input", type=str, help="Input JSONL with {messages:[...]} per line")
    p.add_argument("out_dir", type=str, help="Output directory")
    p.add_argument("--val_ratio", type=float, default=0.2, help="Validation fraction (default 0.2)")
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    inp = Path(args.input)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    data = []
    with inp.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if "messages" not in obj:
                raise SystemExit("Each line must contain a 'messages' array")
            data.append(obj)

    random.seed(args.seed)
    random.shuffle(data)
    n = len(data)
    n_val = int(n * args.val_ratio)
    val = data[:n_val]
    train = data[n_val:]

    with (out / "train.jsonl").open("w", encoding="utf-8") as f:
        for item in train:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    with (out / "val.jsonl").open("w", encoding="utf-8") as f:
        for item in val:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"Wrote {len(train)} train and {len(val)} val to {out}")


if __name__ == "__main__":
    main()
