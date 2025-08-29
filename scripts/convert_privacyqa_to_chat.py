#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

"""
Convert SmartAudit privacyqa *.jsonl (question, expected_answer[, context_blocks])
into chat-style JSONL with {"messages": [{role, content}, ...]} pairs.
This uses only question -> expected_answer to create a single-turn chat example.
"""

def convert_file(inp: Path, out: Path) -> int:
    n = 0
    with inp.open("r", encoding="utf-8") as fin, out.open("w", encoding="utf-8") as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            q = obj.get("question") or obj.get("prompt") or ""
            a = obj.get("expected_answer") or obj.get("answer") or ""
            if not q or not a:
                continue
            chat = {"messages": [
                {"role": "user", "content": q},
                {"role": "assistant", "content": a},
            ]}
            fout.write(json.dumps(chat, ensure_ascii=False) + "\n")
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser(description="Convert privacyqa JSONL to chat JSONL")
    ap.add_argument("--train_in", type=str, required=True)
    ap.add_argument("--val_in", type=str, required=False)
    ap.add_argument("--out_dir", type=str, required=True)
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    cnt_train = convert_file(Path(args.train_in), out_dir / "train.jsonl")
    print(f"Wrote {cnt_train} examples to {out_dir / 'train.jsonl'}")

    if args.val_in:
        cnt_val = convert_file(Path(args.val_in), out_dir / "val.jsonl")
        print(f"Wrote {cnt_val} examples to {out_dir / 'val.jsonl'}")


if __name__ == "__main__":
    main()
