from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional
import asyncio

from adk.llm.mcp_router import LLMRouter, LLMResponse


@dataclass
class ScoreResult:
    score: int
    rationale: str
    provider: str
    model: str
    cited_clauses: List[str]


class ScorerAgent:
    def __init__(self) -> None:
        self.router = LLMRouter()

    async def score(self, prompt: str) -> ScoreResult:
        resp: Optional[LLMResponse] = await self.router.generate(prompt)
        text = (resp.text if resp else "").strip()
        # naive parse: find first number 0-5
        import re
        m = re.search(r"\b([0-5])\b", text)
        score = int(m.group(1)) if m else 3
        # extract cited clause IDs like #LAW-xx or [LAW.xx#id]
        cited = re.findall(r"\[([A-Za-z0-9_.#-]+)\]", text)
        return ScoreResult(
            score=score,
            rationale=text,
            provider=resp.provider if resp else "unknown",
            model=resp.model if resp else "unknown",
            cited_clauses=cited,
        )
