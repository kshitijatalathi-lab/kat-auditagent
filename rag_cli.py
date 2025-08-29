#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os

# Optional: load environment variables from .env if present (explicit project path)
try:
    from pathlib import Path
    from dotenv import load_dotenv  # type: ignore
    ROOT = Path(__file__).resolve().parent
    load_dotenv(dotenv_path=ROOT / ".env", override=True)
except Exception:
    pass
from typing import List, Optional

# Import Unsloth early to ensure optimizations are applied before transformers is loaded
try:
    from unsloth import FastLanguageModel  # type: ignore
    _UNSLOTH_AVAILABLE = True
except Exception:
    FastLanguageModel = None  # type: ignore
    _UNSLOTH_AVAILABLE = False

try:
    from smartaudit.retrieval import retrieve_top_k  # type: ignore
    from smartaudit.logging_utils import log_interaction, collect_feedback  # type: ignore
except Exception:
    from retrieval import retrieve_top_k  # type: ignore
    from logging_utils import log_interaction, collect_feedback  # type: ignore

HEADER = (
    "You are SmartAudit, an assistant for compliance and audit tasks. "
    "Ground your answer in the provided CONTEXT when possible and include short citations like [#1], [#2]. "
    "If the context is insufficient, still provide a concise, accurate answer based on general best practices and domain knowledge.\n\n"
)


def build_prompt(query: str, chunks: List, audit_context: str | None = None) -> str:
    ctx_lines: list[str] = []
    for i, r in enumerate(chunks, start=1):
        ctx_lines.append(f"[#${i} {r.source}#{r.chunk_id}]\n{r.text}\n".replace("#$", "#"))
    context_block = "\n".join(ctx_lines)
    audit_ctx_block = f"AUDIT CONTEXT:\n{audit_context}\n\n" if audit_context else ""
    prompt = (
        f"{HEADER}{audit_ctx_block}QUESTION: {query}\n\nCONTEXT:\n{context_block}\n\n"
        "INSTRUCTIONS:\n"
        "- Provide a concise, accurate answer.\n"
        "- Include short citations like [#1] referencing the context block IDs when you use the context.\n"
        "- If the context does not fully answer the question, provide a helpful answer based on general knowledge while remaining consistent with the context.\n"
    )
    return prompt


# ---- Local (Unsloth) generation ----

def _load_local(model_dir: str):
    if not _UNSLOTH_AVAILABLE or FastLanguageModel is None:  # type: ignore
        return None, None, "Unsloth unavailable"
    try:
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=model_dir,
            max_seq_length=2048,
            dtype=None,
            load_in_4bit=False,
        )
        return model, tokenizer, None
    except Exception as e:
        return None, None, f"Failed to load local model: {e}"


def _local_generate(model, tokenizer, prompt: str, max_new_tokens: int = 300) -> str:
    import torch

    inputs = tokenizer(prompt, return_tensors="pt")
    device = getattr(model, "device", None) or ("cuda" if torch.cuda.is_available() else "cpu")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model.generate(**inputs, max_new_tokens=max_new_tokens)
    return tokenizer.decode(outputs[0], skip_special_tokens=True)


# ---- OpenAI fallback ----

def _openai_client():
    try:
        from openai import OpenAI  # type: ignore
    except Exception as e:
        return None, f"OpenAI sdk missing: {e}"
    if not os.getenv("OPENAI_API_KEY"):
        return None, "Missing OPENAI_API_KEY"
    try:
        # Rely on env for credentials to avoid passing unsupported kwargs
        return OpenAI(), None
    except Exception as e:
        return None, f"OpenAI init failed: {e}"


def _openai_generate(client, prompt: str, model_name: str, max_new_tokens: int = 300) -> str:
    resp = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": "You are SmartAudit. Answer only using provided context and include short citations like [#1]."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=max_new_tokens,
    )
    return resp.choices[0].message.content or ""


# ---- Ollama provider ----

def _ollama_generate(prompt: str, model_name: Optional[str] = None, max_new_tokens: int = 300) -> str:
    import time
    import requests  # type: ignore

    url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
    model = model_name or os.getenv("OLLAMA_MODEL", "llama3.2:1b")
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": max_new_tokens, "temperature": 0.3},
    }

    last_err = None
    for attempt in range(3):
        try:
            r = requests.post(url, json=payload, timeout=600)
            r.raise_for_status()
            data = r.json()
            return data.get("response", "")
        except Exception as e:
            last_err = e
            # Exponential backoff to handle cold start
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Ollama request failed after retries: {last_err}")


# ---- Gemini provider ----

def _gemini_generate(prompt: str, model_name: Optional[str] = None, max_new_tokens: int = 300, temperature: float = 0.3) -> str:
    """Generate using Google Gemini API via google-generativeai, with simple retries for rate limits.
    Requires GEMINI_API_KEY or GOOGLE_API_KEY env var.
    """
    try:
        import time
        import google.generativeai as genai  # type: ignore
    except Exception as e:
        raise RuntimeError(f"google-generativeai not installed: {e}")

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY or GOOGLE_API_KEY")
    genai.configure(api_key=api_key)

    primary = model_name or os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    alternates = [m for m in [os.getenv("GEMINI_MODEL_FALLBACK"), "gemini-1.5-flash-8b"] if m]
    models_to_try = [primary] + [m for m in alternates if m != primary]

    generation_config = {
        "temperature": float(temperature),
        "max_output_tokens": max_new_tokens,
    }

    last_err: Exception | None = None
    for m in models_to_try:
        gm = genai.GenerativeModel(m)
        # Try up to 2 attempts per model to handle transient 429s
        for attempt in range(2):
            try:
                resp = gm.generate_content(prompt, generation_config=generation_config)
                try:
                    return (resp.text or "").strip()
                except Exception:
                    parts = []
                    for c in getattr(resp, "candidates", []) or []:
                        for p in getattr(c, "content", {}).get("parts", []) or []:
                            t = getattr(p, "text", "")
                            if t:
                                parts.append(t)
                    return "\n".join(parts).strip()
            except Exception as e:
                last_err = e
                msg = str(e)
                # If rate limited, respect a short backoff (default ~60s suggested)
                if "429" in msg or "rate limit" in msg.lower():
                    time.sleep(15 if attempt == 0 else 45)
                else:
                    break  # don't retry non-rate errors for this model
        # try next model
    raise RuntimeError(f"Gemini unavailable: {last_err}")


def answer_query(query: str, k: int, provider: str, model_dir: str, max_new_tokens: int, openai_model: str, rerank: bool, pre_k: Optional[int], prefer_prefix: Optional[str] = None, audit_context: Optional[str] = None, gemini_model: Optional[str] = None, temperature: float = 0.3) -> tuple[str, List]:
    chunks = retrieve_top_k(query, k=k, pre_k=pre_k, rerank=rerank, prefer_prefix=prefer_prefix)
    prompt = build_prompt(query, chunks, audit_context=audit_context)

    if provider == "local":
        model, tokenizer, err = _load_local(model_dir)
        if model is not None:
            try:
                answer = _local_generate(model, tokenizer, prompt, max_new_tokens=max_new_tokens)
                # Log interaction (local)
                log_interaction(
                    query=query,
                    retrieved_chunks=chunks,
                    prompt=prompt,
                    model_output=answer,
                    meta={
                        "provider": "local",
                        "k": k,
                        "pre_k": pre_k,
                        "rerank": rerank,
                        "max_new_tokens": max_new_tokens,
                    },
                )
                return answer, chunks
            except Exception as e:
                print(f"[warn] Local generation failed, will try OpenAI: {e}")
        elif provider == "local":
            raise RuntimeError(f"Local provider requested but unavailable: {err}")

    # Try Ollama only if explicitly requested (avoid local models in auto mode)
    if provider == "ollama":
        try:
            ollama_model = os.getenv("OLLAMA_MODEL", "llama3.2:1b")
            answer = _ollama_generate(prompt, model_name=ollama_model, max_new_tokens=max_new_tokens)
            log_interaction(
                query=query,
                retrieved_chunks=chunks,
                prompt=prompt,
                model_output=answer,
                meta={
                    "provider": "ollama",
                    "model": ollama_model,
                    "k": k,
                    "pre_k": pre_k,
                    "rerank": rerank,
                    "max_new_tokens": max_new_tokens,
                },
            )
            return answer, chunks
        except Exception as e:
            if provider == "ollama":
                raise RuntimeError(f"Ollama unavailable: {e}")
            # else continue to OpenAI as fallback

    # Try Gemini first in auto mode
    if provider in ("gemini", "auto"):
        try:
            gm_name = gemini_model or os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
            answer = _gemini_generate(prompt, model_name=gm_name, max_new_tokens=max_new_tokens, temperature=temperature)
            log_interaction(
                query=query,
                retrieved_chunks=chunks,
                prompt=prompt,
                model_output=answer,
                meta={
                    "provider": "gemini",
                    "model": gm_name,
                    "k": k,
                    "pre_k": pre_k,
                    "rerank": rerank,
                    "max_new_tokens": max_new_tokens,
                },
            )
            return answer, chunks
        except Exception as e:
            if provider == "gemini":
                raise RuntimeError(f"Gemini unavailable: {e}")
            # else continue to OpenAI as fallback

    # OpenAI as secondary cloud fallback in auto mode
    if provider in ("openai", "auto"):
        client, err = _openai_client()
        if client is None:
            raise RuntimeError(f"OpenAI unavailable: {err}")
        answer = _openai_generate(client, prompt, openai_model, max_new_tokens=max_new_tokens)
        # Log interaction (openai)
        log_interaction(
            query=query,
            retrieved_chunks=chunks,
            prompt=prompt,
            model_output=answer,
            meta={
                "provider": "openai",
                "model": openai_model,
                "k": k,
                "pre_k": pre_k,
                "rerank": rerank,
                "max_new_tokens": max_new_tokens,
            },
        )
        return answer, chunks

    raise RuntimeError("No valid provider")


def main():
    parser = argparse.ArgumentParser(description="SmartAudit RAG CLI")
    parser.add_argument("--query", type=str, help="Audit/compliance question")
    parser.add_argument("--k", type=int, default=5, help="Top-k chunks")
    parser.add_argument("--pre-k", dest="pre_k", type=int, default=None, help="Candidate pool for reranking/search (default: max(k,20))")
    parser.add_argument("--rerank", action="store_true", help="Enable cross-encoder reranking (uses retrieval.py configuration)")
    parser.add_argument("--provider", type=str, choices=["auto", "local", "ollama", "openai", "gemini"], default="gemini")
    parser.add_argument("--model-dir", type=str, default=str(os.path.join(os.path.dirname(__file__), "models", "smartaudit-gemma")))
    parser.add_argument("--openai-model", type=str, default=os.getenv("OPENAI_MODEL", "gpt-3.5-turbo"))
    parser.add_argument("--gemini-model", type=str, default=os.getenv("GEMINI_MODEL", "gemini-1.5-flash"))
    parser.add_argument("--temperature", type=float, default=0.3)
    parser.add_argument("--max-new-tokens", type=int, default=300)
    parser.add_argument("--prefer-prefix", type=str, default=None, help="Prefer sources whose path starts with this prefix (e.g., company_policies/)")
    parser.add_argument("--prefer-company", action="store_true", help="Shortcut for --prefer-prefix company_policies/")
    parser.add_argument("--audit-context", type=str, default=None, help="Inline audit context to include above CONTEXT")
    parser.add_argument("--audit-context-file", type=str, default=None, help="Path to a file whose contents will be included as AUDIT CONTEXT")

    args = parser.parse_args()

    query = args.query or input("Enter your audit/compliance question: ")
    prefer_prefix = ("company_policies/" if args.prefer_company else args.prefer_prefix)
    # Load audit context if provided
    audit_ctx = args.audit_context
    if not audit_ctx and args.audit_context_file:
        try:
            with open(args.audit_context_file, "r", encoding="utf-8") as f:
                audit_ctx = f.read()
        except Exception as e:
            print(f"[warn] Failed to read audit context file: {e}")
    answer, supporting = answer_query(
        query=query,
        k=args.k,
        provider=args.provider,
        model_dir=args.model_dir,
        max_new_tokens=args.max_new_tokens,
        openai_model=args.openai_model,
        rerank=args.rerank,
        pre_k=args.pre_k,
        prefer_prefix=prefer_prefix,
        audit_context=audit_ctx,
        gemini_model=args.gemini_model,
        temperature=float(args.temperature),
    )

    print("\n\n🔍 Top Supporting Documents:")
    for r in supporting:
        print(f"— {r.source} (chunk {r.chunk_id}) score={r.score:.3f}")

    print("\n✅ Answer:\n")
    print(answer)


if __name__ == "__main__":
    # Default to preferring company policies in CLI unless explicitly disabled
    try:
        import sys
        if "--prefer-company" not in sys.argv and "--prefer-prefix" not in sys.argv:
            sys.argv.append("--prefer-company")
    except Exception:
        pass
    main()
