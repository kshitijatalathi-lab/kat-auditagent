#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime
from typing import List, Tuple, Optional

import gradio as gr

# Optional: load environment variables from .env if present
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass

try:
    from smartaudit.retrieval import retrieve_top_k  # type: ignore
    import smartaudit.retrieval as retrieval_mod  # type: ignore
    from smartaudit.rag_cli import build_prompt, answer_query  # type: ignore
    from smartaudit.logging_utils import log_interaction, log_feedback  # type: ignore
    from smartaudit.preprocess import clean_text, chunk_paragraphs  # type: ignore
    from smartaudit.report import generate_report_pdf, ChecklistItemResult  # type: ignore
    from smartaudit.audit_flows.data_privacy import audit_checklist as dp_checklist  # type: ignore
except Exception:
    from retrieval import retrieve_top_k  # type: ignore
    import retrieval as retrieval_mod  # type: ignore
    from rag_cli import build_prompt, answer_query  # type: ignore
    from logging_utils import log_interaction, log_feedback  # type: ignore
    from preprocess import clean_text, chunk_paragraphs  # type: ignore
    from report import generate_report_pdf, ChecklistItemResult  # type: ignore
    from audit_flows.data_privacy import audit_checklist as dp_checklist  # type: ignore

# Optional deps for upload processing
try:
    import PyPDF2  # type: ignore
except Exception:
    PyPDF2 = None

try:
    import docx  # type: ignore
except Exception:
    docx = None

try:
    from sentence_transformers import SentenceTransformer  # type: ignore
except Exception:
    SentenceTransformer = None  # Runtime error will be clearer on use

try:
    import faiss  # type: ignore
except Exception:
    faiss = None

import json
import numpy as np

ROOT = Path(__file__).resolve().parent
# Re-load .env explicitly from project directory to ensure keys are available
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(dotenv_path=ROOT / ".env", override=True)
except Exception:
    pass
CHUNKS_PATH = ROOT / "data" / "processed" / "all_chunks.jsonl"
INDEX_PATH = ROOT / "data" / "processed" / "index.faiss"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


def _default_provider() -> str:
    # Prefer configured providers; otherwise fall back to 'auto'
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        return "gemini"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    if os.getenv("OLLAMA_URL"):
        return "ollama"
    return "auto"


def _ensure_index_ready():
    if not CHUNKS_PATH.exists() or not INDEX_PATH.exists():
        raise RuntimeError(
            f"Missing data/index. Build first: python smartaudit/preprocess.py && python smartaudit/build_index.py\n"
            f"Expected: {CHUNKS_PATH} and {INDEX_PATH}"
        )


def _load_index_and_model():
    if SentenceTransformer is None or faiss is None:
        raise RuntimeError("Please install sentence-transformers and faiss-cpu.")
    index = faiss.read_index(str(INDEX_PATH))
    model = SentenceTransformer(MODEL_NAME)
    return index, model


def _append_chunks(records: List[dict]):
    CHUNKS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CHUNKS_PATH.open("a", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def _next_chunk_start_for_source(source: str) -> int:
    # Find current max chunk_id for this source; return next start id
    max_id = -1
    if CHUNKS_PATH.exists():
        with CHUNKS_PATH.open("r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                obj = json.loads(line)
                if obj.get("source") == source:
                    try:
                        cid = int(obj.get("chunk_id", -1))
                        if cid > max_id:
                            max_id = cid
                    except Exception:
                        continue
    return max_id + 1


def add_document_to_index(text: str, source_name: str, chunk_max_chars: int = 1200) -> int:
    """Chunk -> embed -> append to FAISS and chunks file. Returns number of chunks added."""
    _ensure_index_ready()
    index, model = _load_index_and_model()

    cleaned = clean_text(text)
    chunks = chunk_paragraphs(cleaned, max_chars=chunk_max_chars)
    if not chunks:
        return 0

    start_id = _next_chunk_start_for_source(source_name)
    new_records = []
    for i, ch in enumerate(chunks):
        new_records.append({
            "source": source_name,
            "chunk_id": start_id + i,
            "text": ch,
        })

    # Append chunks to file (order matters, must match embeddings order)
    _append_chunks(new_records)

    # Embed and append to FAISS index
    texts = [r["text"] for r in new_records]
    embs = model.encode(texts, batch_size=64, convert_to_numpy=True, normalize_embeddings=True)
    index.add(np.asarray(embs, dtype=np.float32))
    faiss.write_index(index, str(INDEX_PATH))

    # Clear retrieval caches so subsequent queries see new data
    try:
        retrieval_mod._load_index.cache_clear()
        retrieval_mod._load_chunks.cache_clear()
    except Exception:
        pass

    return len(new_records)


def rag_chat(message: str, provider: str = "auto", k: int = 8, pre_k: Optional[int] = 40, rerank: bool = True,
             openai_model: str = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo"), max_new_tokens: int = 300,
             prefer_company: bool = False) -> Tuple[str, str]:
    _ensure_index_ready()
    # Try full pipeline; if provider not configured, fall back to retrieval-only with guidance
    try:
        answer, chunks = answer_query(
            query=message,
            k=k,
            provider=provider,
            model_dir=str(ROOT / "models" / "smartaudit-gemma"),
            max_new_tokens=max_new_tokens,
            openai_model=openai_model,
            rerank=rerank,
            pre_k=pre_k,
            prefer_prefix=("company_policies/" if prefer_company else None),
        )
    except Exception as e:
        # Attempt provider fallbacks automatically
        last_err = e
        fallback_answer = None
        fallback_chunks = None
        # Try OpenAI if configured
        if os.getenv("OPENAI_API_KEY"):
            try:
                fallback_answer, fallback_chunks = answer_query(
                    query=message,
                    k=k,
                    provider="openai",
                    model_dir=str(ROOT / "models" / "smartaudit-gemma"),
                    max_new_tokens=max_new_tokens,
                    openai_model=openai_model,
                    rerank=rerank,
                    pre_k=pre_k,
                    prefer_prefix=("company_policies/" if prefer_company else None),
                )
            except Exception as e2:
                last_err = e2
        # Try Ollama if configured
        if fallback_answer is None and os.getenv("OLLAMA_URL"):
            try:
                fallback_answer, fallback_chunks = answer_query(
                    query=message,
                    k=k,
                    provider="ollama",
                    model_dir=str(ROOT / "models" / "smartaudit-gemma"),
                    max_new_tokens=max_new_tokens,
                    openai_model=openai_model,
                    rerank=rerank,
                    pre_k=pre_k,
                    prefer_prefix=("company_policies/" if prefer_company else None),
                )
            except Exception as e3:
                last_err = e3
        if fallback_answer is not None:
            answer, chunks = fallback_answer, fallback_chunks  # type: ignore
        else:
            # Retrieve context so the user still gets value
            chunks = retrieve_top_k(
                message,
                k=k,
                pre_k=pre_k,
                rerank=rerank,
                prefer_prefix=("company_policies/" if prefer_company else None),
            )
            msg = str(last_err)
            tips = []
            if "OPENAI_API_KEY" in msg:
                tips.append("Set OPENAI_API_KEY or switch Provider.")
            if "GEMINI_API_KEY" in msg or "GOOGLE_API_KEY" in msg or "Gemini" in msg:
                tips.append("Set GEMINI_API_KEY/GOOGLE_API_KEY or switch Provider.")
            if "Ollama" in msg:
                tips.append("Set OLLAMA_URL and ensure the model is available.")
            hint = (" ".join(tips) or "Try another Provider or configure API keys in your environment.")
            answer = f"Generation provider not available: {msg}. {hint}\n\nHere are the most relevant sources from your index."
    # Build context preview
    ctx = []
    for r in chunks:
        snippet = r.text.strip().replace("\n", " ")
        if len(snippet) > 300:
            snippet = snippet[:300] + "..."
        ctx.append(f"{r.source}#{r.chunk_id}: {snippet}")
    context_text = "\n\n".join(ctx)

    # Also log interaction (already logged in answer_query), but we keep it here if needed for UI-only calls
    try:
        prompt = build_prompt(message, chunks)
        log_interaction(
            query=message,
            retrieved_chunks=chunks,
            prompt=prompt,
            model_output=answer,
            meta={"ui": "gradio", "provider": provider, "k": k, "pre_k": pre_k, "rerank": rerank},
        )
    except Exception:
        pass

    return answer, context_text


def process_uploaded_docs(files) -> str:
    _ensure_index_ready()
    if not files:
        return "No files uploaded."
    total_chunks = 0
    for file in files:
        p = Path(file.name)
        ext = p.suffix.lower()
        text = ""
        if ext == ".pdf":
            if PyPDF2 is None:
                return "PyPDF2 not installed. pip install PyPDF2"
            try:
                reader = PyPDF2.PdfReader(file.name)
                text = "\n".join([page.extract_text() or "" for page in reader.pages])
            except Exception as e:
                return f"Failed to read PDF {p.name}: {e}"
        elif ext in {".docx"}:
            if docx is None:
                return "python-docx not installed. pip install python-docx"
            try:
                d = docx.Document(file.name)
                text = "\n".join([para.text for para in d.paragraphs])
            except Exception as e:
                return f"Failed to read DOCX {p.name}: {e}"
        elif ext in {".txt"}:
            try:
                text = Path(file.name).read_text(encoding="utf-8", errors="ignore")
            except Exception as e:
                return f"Failed to read TXT {p.name}: {e}"
        else:
            # Skip unsupported files but continue processing others
            continue

        added = add_document_to_index(text, source_name=f"company_policies/{p.name}")
        total_chunks += added
    return f"Uploaded {len(files)} file(s). Added {total_chunks} chunk(s) to index."


with gr.Blocks() as demo:
    gr.Markdown("# 🧠 SmartAudit Assistant")
    gr.Markdown("Upload your documents and ask audit questions. Answers are grounded via RAG.")

    with gr.Tabs():
        with gr.TabItem("Chat"):
            with gr.Row():
                provider = gr.Radio(["auto", "openai", "gemini", "local", "ollama"], value=_default_provider(), label="Provider")
                k_in = gr.Slider(1, 20, value=8, step=1, label="Top-k")
                pre_k_in = gr.Slider(10, 200, value=40, step=5, label="Pre-k (rerank pool)")
                rerank_in = gr.Checkbox(value=True, label="Rerank")
                max_tokens_in = gr.Slider(100, 800, value=350, step=50, label="Max new tokens")
                prefer_company = gr.Checkbox(value=False, label="Prefer company policies")

            chatbot = gr.Chatbot(height=350)
            msg = gr.Textbox(label="Ask a question...", placeholder="E.g., What evidence is needed for a GDPR DPIA?")
            context_box = gr.Textbox(label="🔍 Retrieved Context", lines=8)
            last_question = gr.State("")

            with gr.Accordion("Document Upload", open=False):
                upload_btn = gr.File(file_types=[".pdf", ".txt", ".docx"], file_count="multiple", label="Upload PDFs/TXT/DOCX")
                upload_output = gr.Textbox(label="Upload Status")
                upload_btn.change(fn=process_uploaded_docs, inputs=upload_btn, outputs=upload_output)

            def respond(message, chat_history, provider, k, pre_k, rerank, max_tokens, prefer_comp):
                answer, context = rag_chat(
                    message,
                    provider=provider,
                    k=int(k),
                    pre_k=int(pre_k),
                    rerank=bool(rerank),
                    max_new_tokens=int(max_tokens),
                    prefer_company=bool(prefer_comp),
                )
                chat_history = chat_history + [(message, answer)]
                return chat_history, context, "", message

            msg.submit(
                respond,
                [msg, chatbot, provider, k_in, pre_k_in, rerank_in, max_tokens_in, prefer_company],
                [chatbot, context_box, msg, last_question],
            )

            with gr.Accordion("Feedback", open=False):
                fb = gr.Textbox(label="Was this helpful? Leave feedback.", lines=2)
                fb_btn = gr.Button("Submit Feedback")
                fb_status = gr.Markdown(visible=False)

                def submit_feedback(feedback_text: str, question: str):
                    try:
                        log_feedback(query=question or "", rating=None, comment=feedback_text or "", meta={"ui": "gradio"})
                        return gr.update(value="✅ Thanks for your feedback!", visible=True), ""
                    except Exception:
                        return gr.update(value="⚠️ Failed to record feedback.", visible=True), feedback_text

                fb_btn.click(submit_feedback, [fb, last_question], [fb_status, fb])

        with gr.TabItem("Audit Checklist"):
            gr.Markdown("Run a simulated audit. Answer each checklist question; AI provides feedback and a final report.")

            # Checklist selection (expandable later)
            checklist_name = gr.Dropdown(choices=["Data Privacy"], value="Data Privacy", label="Checklist")
            # Provider settings
            with gr.Row():
                prov2 = gr.Radio(["auto", "openai", "gemini", "local", "ollama"], value="auto", label="Provider")
                k2 = gr.Slider(1, 20, value=8, step=1, label="Top-k")
                pre_k2 = gr.Slider(10, 200, value=40, step=5, label="Pre-k")
                rerank2 = gr.Checkbox(value=True, label="Rerank")
                max_tokens2 = gr.Slider(100, 800, value=300, step=50, label="Max new tokens")
                prefer_company2 = gr.Checkbox(value=False, label="Prefer company policies")

            # State holders
            q_index = gr.State(0)
            answers = gr.State([])  # list of str
            feedbacks = gr.State([])  # list of str
            questions = gr.State(dp_checklist)

            question_box = gr.Markdown()
            user_answer = gr.Textbox(label="Your answer", lines=4)
            ai_feedback = gr.Textbox(label="AI feedback", lines=4, interactive=False)

            with gr.Row():
                prev_btn = gr.Button("◀ Previous")
                next_btn = gr.Button("Next ▶")
                gen_fb_btn = gr.Button("Generate AI Feedback")
                export_btn = gr.Button("Export Report (PDF/TXT)")
                export_status = gr.Textbox(label="Report path/status")

            def _set_question(idx: int, qs: list[str]):
                idx = max(0, min(idx, len(qs) - 1))
                return f"### Question {idx+1}/{len(qs)}\n\n{qs[idx]}", idx

            def load_first(qs):
                text, idx = _set_question(0, qs)
                return text, 0, "", ""

            checklist_name.change(load_first, inputs=[questions], outputs=[question_box, q_index, user_answer, ai_feedback])

            def do_prev(idx, qs, ans_list, fb_list):
                new_idx = max(0, idx - 1)
                text, new_idx = _set_question(new_idx, qs)
                # Restore previous entries if present
                ua = ans_list[new_idx] if new_idx < len(ans_list) else ""
                fb = fb_list[new_idx] if new_idx < len(fb_list) else ""
                return text, new_idx, ua, fb

            def do_next(idx, qs, ans_list, fb_list, ua_current):
                # Save current answer
                if idx < len(qs):
                    if len(ans_list) <= idx:
                        ans_list = ans_list + [""] * (idx - len(ans_list) + 1)
                    ans_list[idx] = ua_current or ""
                new_idx = min(len(qs) - 1, idx + 1)
                text, new_idx = _set_question(new_idx, qs)
                ua = ans_list[new_idx] if new_idx < len(ans_list) else ""
                fb = fb_list[new_idx] if new_idx < len(fb_list) else ""
                return text, new_idx, ua, fb, ans_list

            prev_btn.click(do_prev, inputs=[q_index, questions, answers, feedbacks], outputs=[question_box, q_index, user_answer, ai_feedback])
            next_btn.click(do_next, inputs=[q_index, questions, answers, feedbacks, user_answer], outputs=[question_box, q_index, user_answer, ai_feedback, answers])

            def make_feedback(idx, qs, ans_list, ua_current, provider, k, pre_k, rerank, max_tokens, prefer_comp):
                # Persist current answer
                if len(ans_list) <= idx:
                    ans_list = ans_list + [""] * (idx - len(ans_list) + 1)
                ans_list[idx] = ua_current or ""
                q = qs[idx]
                prompt = f"Question: {q}\n\nUser answer: {ua_current or ''}\n\nAssess compliance and provide concise feedback with citations."
                answer, _ = answer_query(
                    query=prompt,
                    k=int(k),
                    provider=provider,
                    model_dir=str(ROOT / "models" / "smartaudit-gemma"),
                    max_new_tokens=int(max_tokens),
                    openai_model=os.getenv("OPENAI_MODEL", "gpt-3.5-turbo"),
                    rerank=bool(rerank),
                    pre_k=int(pre_k) if pre_k else None,
                    prefer_prefix=("company_policies/" if prefer_comp else None),
                )
                return answer, ans_list

            def gen_feedback(idx, qs, ans_list, ua_current, provider, k, pre_k, rerank, max_tokens, fb_list, prefer_comp):
                fb, ans_list = make_feedback(idx, qs, ans_list, ua_current, provider, k, pre_k, rerank, max_tokens, prefer_comp)
                if len(fb_list) <= idx:
                    fb_list = fb_list + [""] * (idx - len(fb_list) + 1)
                fb_list[idx] = fb
                return fb, ans_list, fb_list

            gen_fb_btn.click(
                gen_feedback,
                inputs=[q_index, questions, answers, user_answer, prov2, k2, pre_k2, rerank2, max_tokens2, feedbacks, prefer_company2],
                outputs=[ai_feedback, answers, feedbacks],
            )

            def export_report(qs, ans_list, fb_list, name):
                items = []
                for i, q in enumerate(qs):
                    ua = ans_list[i] if i < len(ans_list) else ""
                    fb = fb_list[i] if i < len(fb_list) else ""
                    items.append(ChecklistItemResult(question=q, user_answer=ua, ai_feedback=fb))
                ts = datetime.now().strftime("%Y%m%d-%H%M%S")
                out_dir = ROOT / "reports"
                out_path = out_dir / f"audit_report_{name.lower().replace(' ', '_')}_{ts}.pdf"
                try:
                    path = generate_report_pdf(
                        title="SmartAudit Compliance Report",
                        checklist_name=name,
                        items=items,
                        out_path=str(out_path),
                        summary="Automated audit summary generated by SmartAudit.",
                    )
                except Exception as e:
                    return f"Failed to generate report: {e}"
                return f"Saved report to: {path}"

            export_btn.click(export_report, inputs=[questions, answers, feedbacks, checklist_name], outputs=[export_status])


if __name__ == "__main__":
    share = os.getenv("GRADIO_SHARE", "false").lower() in {"1", "true", "yes"}
    demo.launch(share=share)
