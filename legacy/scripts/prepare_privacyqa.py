import argparse
import json
import os
from typing import List, Dict

from datasets import load_dataset


def chunk_text(text: str, max_chars: int = 900) -> List[str]:
    text = (text or "").strip().replace("\r", " ")
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            dot = text.rfind(".", start, end)
            spc = text.rfind(" ", start, end)
            split_at = dot if dot > start + 200 else spc if spc > start + 200 else end
        else:
            split_at = end
        chunk = text[start:split_at].strip()
        if chunk:
            chunks.append(chunk)
        start = split_at
    return chunks


def to_blocks(context: str, source_name: str = "privacyqa_doc") -> List[Dict]:
    parts = chunk_text(context)
    blocks = []
    for i, p in enumerate(parts, start=1):
        blocks.append({"id": i, "source": f"{source_name}#{i}", "text": p})
    if not blocks:
        blocks = [{"id": 1, "source": f"{source_name}#1", "text": context or ""}]
    return blocks


def prepare(output_jsonl: str, split: str = "train", limit: int | None = None):
    ds = load_dataset("alzoubi36/privacy_qa", split=split)
    out = []
    # Treat limit<=0 as full split
    n = len(ds) if (limit is None or (isinstance(limit, int) and limit <= 0)) else min(limit, len(ds))
    for i in range(n):
        row = ds[i]
        q = (row.get("question") or "").strip()
        txt = row.get("text") or ""
        label = row.get("label")
        blocks = to_blocks(txt, source_name="privacyqa")
        if label in (0, 1):
            expected = ("No [#1]" if label == 0 else "Yes [#1]")
        else:
            expected = "Not in context"
        out.append({
            "question": q,
            "context_blocks": blocks,
            "expected_answer": expected,
        })
    os.makedirs(os.path.dirname(output_jsonl), exist_ok=True)
    with open(output_jsonl, "w", encoding="utf-8") as w:
        for row in out:
            w.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Wrote {len(out)} examples to {output_jsonl}")


def main():
    ap = argparse.ArgumentParser(description="Prepare PrivacyQA into SmartAudit JSONL schema")
    ap.add_argument("--output_jsonl", required=True)
    ap.add_argument("--split", default="train")
    ap.add_argument("--limit", type=int, default=1000)
    args = ap.parse_args()
    prepare(args.output_jsonl, split=args.split, limit=args.limit)


if __name__ == "__main__":
    main()
