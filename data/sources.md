# Data Sources

This document lists public sources used for SmartAudit Day 1–2.

- GDPR (General Data Protection Regulation) official text — EUR-Lex
  - Example URL: https://eur-lex.europa.eu/eli/reg/2016/679/oj
  - Local files (PDF -> text -> chunks): see `smartaudit/data/extracted/` and `smartaudit/data/processed/`
- Additional languages: BG, DE, EN, ES, GA (from EUR-Lex variants)

Counts (current workspace snapshot):
- Extracted text files: 5 (`smartaudit/data/extracted/`)
- Chunks generated: see `smartaudit/data/processed/regulations_chunks.jsonl` (approx 440)

Notes:
- Company policy templates: to be added under `smartaudit/data/company_policies/` as `.txt` files.
- After adding, rerun preprocessing and rebuild the FAISS index.
