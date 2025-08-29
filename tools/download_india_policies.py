#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path
import argparse

import requests
import fitz  # PyMuPDF
import docx

# Optional: load environment variables from .env if present
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass


def convert_pdf_to_text(pdf_path: Path, txt_path: Path) -> None:
    try:
        with fitz.open(pdf_path) as doc:
            text = "\n".join(page.get_text() for page in doc)
        txt_path.write_text(text, encoding="utf-8")
        print(f"📄 Converted PDF to TXT: {txt_path.name}")
    except Exception as e:
        print(f"❌ PDF conversion failed for {pdf_path.name}: {e}")


def convert_docx_to_text(docx_path: Path, txt_path: Path) -> None:
    try:
        d = docx.Document(docx_path)
        text = "\n".join([para.text for para in d.paragraphs])
        txt_path.write_text(text, encoding="utf-8")
        print(f"📄 Converted DOCX to TXT: {txt_path.name}")
    except Exception as e:
        print(f"❌ DOCX conversion failed for {docx_path.name}: {e}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Download India DPIA/DPDP materials and/or convert local PDFs/DOCX to TXT")
    ap.add_argument("--from-dir", type=str, default=str(Path.home() / "Downloads"), help="Directory to scan for local PDFs/DOCX to convert")
    ap.add_argument("--from-downloads", type=int, default=0, help="If >0, convert the latest N PDFs from --from-dir to TXT under company_policies")
    args = ap.parse_args()
    root = Path(__file__).resolve().parents[1]
    data_dir = root / "data" / "company_policies" / "india"
    txt_dir = data_dir / "txt"
    data_dir.mkdir(parents=True, exist_ok=True)
    txt_dir.mkdir(parents=True, exist_ok=True)

    files_to_download = {
        "dpdp_act_2023_summary.pdf": "https://dpdpa.com/pdf/DPDP-Act-2023-Summary.pdf",
        "genieai_pia_template.docx": "https://www.genieai.co/en-in/template/personal-information-impact-assessment/download",
        "dpo_india_compliance_checklist.pdf": "https://dpo-india.com/wp-content/uploads/2024/03/DPDP-Compliance-Checklist-DPO-India.pdf",
        "cyberlawconsulting_dpia_guide.pdf": "https://www.cyberlawconsulting.com/pdf/DPIA-under-DPDPA-2023.pdf",
    }

    # Download files (best effort)
    for filename, url in files_to_download.items():
        path = data_dir / filename
        try:
            print(f"⬇️  Downloading {filename} ...")
            r = requests.get(url, timeout=30)
            if r.status_code == 200 and r.content:
                path.write_bytes(r.content)
                print(f"✅ Downloaded: {filename}")
            else:
                print(f"❌ Failed to download {filename}: Status code {r.status_code}")
        except Exception as e:
            print(f"❌ Error downloading {filename}: {e}")

    # Convert all downloaded files to txt
    for file in data_dir.iterdir():
        if file.suffix.lower() == ".pdf":
            convert_pdf_to_text(file, txt_dir / (file.stem + ".txt"))
        elif file.suffix.lower() == ".docx":
            convert_docx_to_text(file, txt_dir / (file.stem + ".txt"))

    # Optionally convert latest N PDFs from a local directory (e.g., Downloads)
    if args.from_downloads and args.from_downloads > 0:
        local_dir = Path(args.from_dir)
        if local_dir.exists():
            pdfs = sorted(local_dir.glob("*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True)[: args.from_downloads]
            for pdf in pdfs:
                out_txt = (Path(__file__).resolve().parents[1] / "data" / "company_policies" / (pdf.stem + ".txt"))
                try:
                    convert_pdf_to_text(pdf, out_txt)
                except Exception as e:
                    print(f"❌ Failed converting local PDF {pdf.name}: {e}")
        else:
            print(f"⚠️  Local directory not found: {local_dir}")

    print("\n✅ Done. TXT files are in:", txt_dir)
    print("You can now run:\n  PYTHONPATH=. python3 smartaudit/preprocess.py\n  PYTHONPATH=. python3 smartaudit/build_index.py")


if __name__ == "__main__":
    main()
