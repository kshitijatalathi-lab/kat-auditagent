import argparse
import json
import os
from typing import List, Dict

import tiktoken


def chunk_text(text: str, max_chars: int = 800) -> List[str]:
    text = text.strip().replace("\r", " ")
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            # try to split on sentence boundary or whitespace
            dot = text.rfind(".", start, end)
            spc = text.rfind(" ", start, end)
            split_at = dot if dot > start + 200 else spc if spc > start + 200 else end
        else:
            split_at = end
        chunks.append(text[start:split_at].strip())
        start = split_at
    return [c for c in chunks if c]


def to_blocks(context: str, source_name: str) -> List[Dict]:
    parts = chunk_text(context)
    blocks = []
    for i, p in enumerate(parts, start=1):
        blocks.append({"id": i, "source": f"{source_name}#{i}", "text": p})
    return blocks


def prepare_from_squad(input_json: str, output_jsonl: str, source_field: str = None):
    with open(input_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    out = []
    for article in data.get("data", []):
        title = article.get("title") or "squad_doc"
        for para in article.get("paragraphs", []):
            context = para.get("context", "")
            blocks = to_blocks(context, title)
            for qa in para.get("qas", []):
                q = qa.get("question", "").strip()
                # We do not force the ground truth answer; RAG answers will be matched loosely in eval
                expected_answer = qa.get("answers", [{}])[0].get("text", "Not in context")
                out.append({
                    "question": q,
                    "context_blocks": blocks,
                    "expected_answer": expected_answer if expected_answer else "Not in context",
                })

    with open(output_jsonl, "w", encoding="utf-8") as w:
        for row in out:
            w.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Wrote {len(out)} examples to {output_jsonl}")


def main():
    ap = argparse.ArgumentParser(description="Convert SQuAD-like JSON to SmartAudit JSONL schema")
    ap.add_argument("--input_json", required=True, help="Path to SQuAD or SQuAD-like JSON")
    ap.add_argument("--output_jsonl", required=True, help="Output JSONL path")
    args = ap.parse_args()

    os.makedirs(os.path.dirname(args.output_jsonl), exist_ok=True)
    prepare_from_squad(args.input_json, args.output_jsonl)


if __name__ == "__main__":
    main()
