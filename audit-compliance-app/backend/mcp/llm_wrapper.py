from __future__ import annotations

import os
from typing import Any, Dict, List

from .context import MCPContext


class LLMClient:
    """Wrapper around mcp-llm-server.

    In production, this would send prompts to the MCP LLM server and return
    structured results. For local development, supports LLM_MOCK mode.
    """

    def __init__(self, ctx: MCPContext) -> None:
        self.ctx = ctx
        self.endpoint = os.getenv("MCP_LLM_URL", "http://localhost:8788")

    async def score_answer(
        self,
        *,
        question: str,
        user_answer: str,
        clauses: List[Dict[str, Any]],
        prefer: str | None = None,
    ) -> Dict[str, Any]:
        # Mock path for dev/test
        if os.getenv("LLM_MOCK", "").lower() in {"1", "true", "yes"}:
            citations = [
                {
                    "id": c.get("clause_id", ""),
                    "law": c.get("law", ""),
                    "article": c.get("article", ""),
                }
                for c in (clauses or [])
            ][:3]
            ua = (user_answer or "").lower()
            # Map negative language to lower score; constrain to 0–3
            score = 1 if any(w in ua for w in ("no", "not", "none", "n/a")) else 3
            return {
                "score": int(score),
                "rationale": (
                    f"MOCK: Scored based on question='{question[:32]}...', answer='{user_answer[:32]}...'."
                ),
                "citations": citations,
                "provider": "mock",
                "model": "mock",
            }
        # TODO: Implement real HTTP/WebSocket call to MCP LLM server
        raise NotImplementedError("Real mcp-llm-server integration not yet implemented.")
