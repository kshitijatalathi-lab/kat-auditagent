from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
import argparse
from pathlib import Path
from typing import Iterable, List

EXTRACTED_DIR = Path(__file__).resolve().parent / "data" / "extracted"
COMPANY_DIR = Path(__file__).resolve().parent / "data" / "company_policies"
PROCESSED_DIR = Path(__file__).resolve().parent / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# Simple cleaners
WHITESPACE_RE = re.compile(r"[\t\x0b\x0c\r]+")
MULTIBLANK_RE = re.compile(r"\n{3,}")
PAGE_NUM_RE = re.compile(r"\n?\s*Page\s+\d+(?:\s*/\s*\d+)?\s*\n?", flags=re.I)


def clean_text(text: str) -> str:
    # Normalize unicode (quotes, spaces, etc.)
    t = unicodedata.normalize("NFKC", text)
    # Remove non-breaking spaces and soft hyphens
    t = t.replace("\u00a0", " ").replace("\u00ad", "")

    # De-hyphenate words broken across line breaks, including soft hyphen variants
    # e.g., "informa-\n tion" -> "information"
    t = re.sub(r"(\w)[-\u00ad]\s*\n\s*(\w)", r"\1\2", t)

    # Collapse whitespace (tabs, vertical tabs, carriage returns)
    t = WHITESPACE_RE.sub(" ", t)
    # Remove explicit page number boilerplate
    t = PAGE_NUM_RE.sub("\n", t)

    # Conservative intra-word space fixes using suffix/prefix heuristics
    # Join splits like "manifest ly" -> "manifestly", "inter est" -> "interest"
    suffixes = (
        "ly", "ing", "ed", "tion", "sion", "ment", "ness", "ity", "able", "ible",
        "al", "ial", "ous", "ive", "ence", "ance", "est", "ent", "ant", "er", "or",
        "ation", "ations", "ical", "ically", "ism", "ist",
    )
    for sfx in suffixes:
        # word + space + suffix -> word+suffix
        pattern = re.compile(rf"\b([A-Za-z]{{2,}})\s+({sfx})\b", flags=re.IGNORECASE)
        t = pattern.sub(r"\1\2", t)

    prefixes = ("inter", "over", "under", "sub", "pre", "re", "non", "trans", "mis", "dis")
    for pfx in prefixes:
        # prefix + space + word -> prefix+word
        pattern = re.compile(rf"\b({pfx})\s+([A-Za-z]{{3,}})\b", flags=re.IGNORECASE)
        t = pattern.sub(r"\1\2", t)

    # Collapse excessive blank lines
    t = MULTIBLANK_RE.sub("\n\n", t)
    return t.strip()


def chunk_paragraphs(text: str, max_chars: int = 1200) -> List[str]:
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: List[str] = []
    buf: List[str] = []
    size = 0
    for p in paras:
        add_len = len(p) + (2 if buf else 0)
        if size + add_len <= max_chars:
            buf.append(p)
            size += add_len
        else:
            if buf:
                chunks.append("\n\n".join(buf))
            buf = [p]
            size = len(p)
    if buf:
        chunks.append("\n\n".join(buf))
    return chunks


def chunk_words(text: str, chunk_size: int = 250, overlap: int = 50) -> List[str]:
    words = re.split(r"\s+", text.strip())
    chunks: List[str] = []
    if chunk_size <= 0:
        return []
    step = max(1, chunk_size - max(0, overlap))
    for i in range(0, len(words), step):
        chunk = words[i : i + chunk_size]
        if chunk:
            chunks.append(" ".join(chunk))
    return chunks


@dataclass
class ChunkRecord:
    source: str
    chunk_id: int
    text: str

    def to_json(self) -> str:
        return json.dumps({"source": self.source, "chunk_id": self.chunk_id, "text": self.text}, ensure_ascii=False)


def save_chunks(records: Iterable[ChunkRecord], out_path: Path) -> None:
    with out_path.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(rec.to_json() + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Preprocess SmartAudit texts into chunks")
    parser.add_argument("--mode", choices=["paras", "words"], default="paras", help="chunking mode")
    parser.add_argument("--max-chars", type=int, default=1200, help="max chars per paragraph chunk (paras mode)")
    parser.add_argument("--words", type=int, default=250, help="words per chunk (words mode)")
    parser.add_argument("--overlap", type=int, default=50, help="word overlap between chunks (words mode)")
    args = parser.parse_args()

    regs_out = PROCESSED_DIR / "regulations_chunks.jsonl"
    comp_out = PROCESSED_DIR / "company_chunks.jsonl"
    all_out = PROCESSED_DIR / "all_chunks.jsonl"

    # Regulations
    regs_records: List[ChunkRecord] = []
    for txt in sorted(EXTRACTED_DIR.glob("*.txt")):
        raw = txt.read_text(encoding="utf-8", errors="ignore")
        cleaned = clean_text(raw)
        if args.mode == "paras":
            chunks = chunk_paragraphs(cleaned, max_chars=args.max_chars)
        else:
            chunks = chunk_words(cleaned, chunk_size=args.words, overlap=args.overlap)
        for i, ch in enumerate(chunks):
            regs_records.append(ChunkRecord(source=f"regulations/{txt.name}", chunk_id=i, text=ch))
    save_chunks(regs_records, regs_out)
    print(f"Wrote {len(regs_records)} chunks to {regs_out}")

    # Company policies (optional folder) - include all subdirectories
    comp_records: List[ChunkRecord] = []
    if COMPANY_DIR.exists():
        for txt in sorted(COMPANY_DIR.rglob("*.txt")):
            raw = txt.read_text(encoding="utf-8", errors="ignore")
            cleaned = clean_text(raw)
            if args.mode == "paras":
                chunks = chunk_paragraphs(cleaned, max_chars=args.max_chars)
            else:
                chunks = chunk_words(cleaned, chunk_size=args.words, overlap=args.overlap)
            rel = txt.relative_to(COMPANY_DIR).as_posix()
            for i, ch in enumerate(chunks):
                comp_records.append(ChunkRecord(source=f"company_policies/{rel}", chunk_id=i, text=ch))
        save_chunks(comp_records, comp_out)
        print(f"Wrote {len(comp_records)} chunks to {comp_out}")
    else:
        print(f"Company policies directory not found: {COMPANY_DIR}")

    # Combined
    combined = regs_records + comp_records
    save_chunks(combined, all_out)
    print(f"Wrote {len(combined)} chunks to {all_out}")


if __name__ == "__main__":
    main()
