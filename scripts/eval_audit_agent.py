from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Dict, List

from adk.services.audit_pipeline import PolicyAuditPipeline
from adk.config import settings
from adk.llm.mcp_router import LLMResponse
try:
    from dotenv import load_dotenv  # type: ignore
except Exception:
    load_dotenv = None  # type: ignore


SAMPLES: List[Dict[str, Any]] = [
    {"file_path": "uploads/comppoli.pdf", "org_id": "acme", "policy_type": "hr", "top_k": 6},
    {"file_path": "uploads/CELEX_32016R0679_EN_TXT.pdf", "org_id": "acme", "policy_type": "gdpr", "top_k": 6},
]


class MockLLM:
    async def generate(self, prompt: str, prefer: str | None = None, temperature: float = 0.2):
        # Return a short deterministic draft derived from the prompt for testing
        text = "\n".join([
            "Section: Data Handling",
            "We will process personal data lawfully and transparently, aligning with identified gaps.",
            "Section: Access Controls",
            "We enforce role-based access and periodic reviews to mitigate risks highlighted above.",
        ])
        return LLMResponse(text=text, provider="mock", model="mock-1")


async def run_eval() -> List[Dict[str, Any]]:
    # Load .env if available
    if load_dotenv is not None:
        try:
            load_dotenv()
        except Exception:
            pass
    use_mock = os.getenv("LLM_MOCK", "").lower() in {"1", "true", "yes"}
    llm = MockLLM() if use_mock else None
    pipeline = PolicyAuditPipeline(llm=llm)
    results: List[Dict[str, Any]] = []
    for case in SAMPLES:
        fp = case["file_path"]
        if not os.path.exists(fp):
            results.append({
                "file": fp,
                "ok": False,
                "error": "missing_file",
            })
            continue
        out = await pipeline.run(
            file_path=fp,
            org_id=case["org_id"],
            policy_type=case["policy_type"],
            top_k=case["top_k"],
        )
        # derive lightweight metrics
        composite = float(out.get("composite", 0.0) or 0.0)
        gaps = out.get("gaps", []) or []
        cd = out.get("corrected_draft") or ""
        llm_info = {
            "prefer": settings.prefer,
            "openai_model": settings.openai_model,
            "gemini_model": settings.gemini_model,
            "groq_model": settings.groq_model,
        }
        metrics = {
            "file": fp,
            "policy_type": out.get("policy_type"),
            "composite": composite,
            "gaps_count": len(gaps),
            "has_report": bool(out.get("report_path")),
            "has_annotated": bool(out.get("annotated_path")),
            "has_corrected_draft": bool(cd),
            "corrected_draft_len": len(cd),
            "llm": llm_info,
        }
        results.append({"ok": True, "metrics": metrics})
    return results


def main() -> None:
    results = asyncio.run(run_eval())
    # print as JSON lines for easy parsing/CI
    for r in results:
        print(json.dumps(r))


if __name__ == "__main__":
    main()
