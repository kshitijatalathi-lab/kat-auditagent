#!/usr/bin/env python3
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
LOG_FILE = ROOT / "logs" / "prompts_log.jsonl"


def load_logs() -> pd.DataFrame:
    if not LOG_FILE.exists():
        print(f"No log file found at {LOG_FILE}")
        return pd.DataFrame()
    df = pd.read_json(LOG_FILE, lines=True)
    return df


def basic_stats(df: pd.DataFrame) -> None:
    if df.empty:
        print("No data to analyze.")
        return

    print("\n=== Rows ===")
    print(len(df))

    print("\n=== Types ===")
    print(df["meta"].apply(lambda x: (x or {}).get("provider") if isinstance(x, dict) else None).value_counts(dropna=False))

    print("\n=== Sample entries ===")
    print(df[["timestamp", "query", "retrieved_sources"]].tail(5))

    print("\n=== Top sources ===")
    c = Counter()
    for lst in df["retrieved_sources"].dropna().tolist():
        if isinstance(lst, list):
            c.update(lst)
    for src, cnt in c.most_common(10):
        print(f"{src}: {cnt}")

    print("\n=== Avg answer length ===")
    lengths = df["response"].dropna().apply(lambda s: len(s) if isinstance(s, str) else 0)
    if not lengths.empty:
        print(round(lengths.mean(), 2))
    else:
        print("n/a")

    print("\n=== Feedback summary (if present) ===")
    fb = df[df.get("type", "") == "feedback"] if "type" in df.columns else pd.DataFrame()
    if not fb.empty:
        ratings = fb["feedback"].apply(lambda d: (d or {}).get("rating") if isinstance(d, dict) else None).dropna()
        if not ratings.empty:
            print("Count:", len(ratings), "Avg:", round(ratings.astype(int).mean(), 2))
        else:
            print("No ratings present.")
    else:
        print("No feedback entries.")


def main():
    df = load_logs()
    basic_stats(df)


if __name__ == "__main__":
    main()
