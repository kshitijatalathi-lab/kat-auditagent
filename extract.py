#!/usr/bin/env python3
from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional

# Try to support either pypdf (new) or PyPDF2 (older)
try:
    from pypdf import PdfReader  # type: ignore
except Exception:  # pragma: no cover
    try:
        from PyPDF2 import PdfReader  # type: ignore
    except Exception:  # pragma: no cover
        PdfReader = None  # type: ignore


def setup_logger(level: int = logging.INFO) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract text from a single PDF file.

    Args:
        pdf_path: Path to the PDF.

    Returns:
        Extracted text as a single string.
    """
    if PdfReader is None:
        raise RuntimeError(
            "No PDF reader found. Please install 'pypdf' or 'PyPDF2' (e.g., pip install pypdf)."
        )

    reader = PdfReader(str(pdf_path))
    parts: List[str] = []
    for i, page in enumerate(reader.pages):
        try:
            text: Optional[str] = page.extract_text()  # type: ignore[attr-defined]
        except Exception as e:  # pragma: no cover
            logging.warning("Failed to extract text from %s page %s: %s", pdf_path.name, i, e)
            text = None
        if text:
            parts.append(text)
    return "\n\n".join(parts)


def ocr_pdf(pdf_path: Path, lang: str = "eng", dpi: int = 300) -> str:
    """Run OCR on a PDF by rasterizing pages then using Tesseract.

    Requires: pdf2image (and system poppler) and pytesseract (and system tesseract-ocr).
    """
    try:
        from pdf2image import convert_from_path  # type: ignore
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            "Missing dependency pdf2image. Install: pip install pdf2image\n"
            "Also install system poppler (e.g., sudo apt-get install poppler-utils)"
        ) from e
    try:
        import pytesseract  # type: ignore
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            "Missing dependency pytesseract. Install: pip install pytesseract\n"
            "Also install system Tesseract (e.g., sudo apt-get install tesseract-ocr)"
        ) from e

    texts: List[str] = []
    try:
        images = convert_from_path(str(pdf_path), dpi=dpi)
        for i, img in enumerate(images):
            try:
                txt = pytesseract.image_to_string(img, lang=lang)
            except Exception as e:  # pragma: no cover
                logging.warning("Tesseract failed on %s page %s: %s", pdf_path.name, i, e)
                txt = ""
            if txt:
                texts.append(txt)
    except Exception as e:  # pragma: no cover
        logging.error("Failed OCR conversion for %s: %s", pdf_path.name, e)
    return "\n\n".join(texts)


def process_all_pdfs(
    input_dir: Path | str = Path(__file__).parent / "data" / "regulations",
    output_dir: Path | str = Path(__file__).parent / "data" / "extracted",
    use_ocr: bool = False,
    ocr_threshold_chars: int = 100,
    ocr_lang: str = "eng",
    ocr_dpi: int = 300,
) -> List[Path]:
    """Process all PDFs in input_dir and write extracted text files to output_dir.

    Args:
        input_dir: Directory containing PDF files.
        output_dir: Directory to store extracted .txt files.

    Returns:
        List of output file paths created.
    """
    setup_logger()

    in_dir = Path(input_dir)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not in_dir.exists():
        logging.error("Input directory does not exist: %s", in_dir)
        return []

    pdfs = sorted(in_dir.glob("*.pdf"))
    if not pdfs:
        logging.warning("No PDFs found in %s", in_dir)
        return []

    results: List[Path] = []
    for pdf in pdfs:
        try:
            logging.info("Extracting: %s", pdf.name)
            text = extract_text_from_pdf(pdf)
            # If extraction failed or seems too short, try OCR when enabled
            if use_ocr and (not text or len(text.strip()) < ocr_threshold_chars):
                logging.info("Falling back to OCR for: %s", pdf.name)
                text = ocr_pdf(pdf, lang=ocr_lang, dpi=ocr_dpi)
            out_file = out_dir / (pdf.stem + ".txt")
            out_file.write_text(text or "", encoding="utf-8")
            results.append(out_file)
            logging.info("Wrote: %s", out_file.relative_to(Path(__file__).parent))
        except Exception as e:  # pragma: no cover
            logging.exception("Failed processing %s: %s", pdf.name, e)

    logging.info("Completed. %d files written.", len(results))
    return results


if __name__ == "__main__":
    process_all_pdfs()
