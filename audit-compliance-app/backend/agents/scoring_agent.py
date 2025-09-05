from __future__ import annotations

from typing import Any, Dict, List, Optional

from .base_agent import BaseAgent
from mcp.llm_wrapper import LLMClient


class ScoringAgent(BaseAgent):
    """Wrapper that delegates scoring to mcp-llm-server via LLMClient."""

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    def name(self) -> str:
        return "scoring"

    async def score(
        self,
        *,
        question: str,
        user_answer: str,
        clauses: List[Dict[str, Any]],
        prefer: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await self.llm.score_answer(
            question=question,
            user_answer=user_answer,
            clauses=clauses,
            prefer=prefer,
        )
