#!/usr/bin/env python3
from __future__ import annotations

import os
from typing import List

from smartaudit.rag_cli import answer_query

TEST_QUERIES: List[str] = [
    "What should be included in a data retention policy?",
    "Is employee consent required under GDPR?",
    "How often should a DPIA be conducted?",
]


def main():
    provider = os.getenv("QA_PROVIDER", "openai")  # openai|local|auto
    model_dir = os.getenv("SMARTAUDIT_LOCAL_MODEL_DIR", "smartaudit/models/smartaudit-gemma")
    openai_model = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")

    for q in TEST_QUERIES:
        try:
            answer, chunks = answer_query(
                query=q,
                k=8,
                provider=provider,
                model_dir=model_dir,
                max_new_tokens=300,
                openai_model=openai_model,
                rerank=True,
                pre_k=40,
            )
            ctx_snippet = (chunks[0].text[:200].replace("\n", " ") + "...") if chunks else "<no context>"
            print(f"\nQ: {q}\nA: {answer[:400]}\nContext: {ctx_snippet}")
        except Exception as e:
            print(f"\nQ: {q}\nError: {e}")


if __name__ == "__main__":
    main()
