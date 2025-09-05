from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
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

    async def score(self, prompt: str, prefer: Optional[str] = None) -> ScoreResult:
        resp: Optional[LLMResponse] = await self.router.generate(prompt, prefer=prefer)
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

    # Structured API for planner/UI
    class ScoreRequest(BaseModel):
        prompt: str
        prefer: Optional[str] = None

    class ScoreResponse(BaseModel):
        score: int
        rationale: str
        provider: str
        model: str
        cited_clauses: List[str]

    async def score_structured(self, req: "ScorerAgent.ScoreRequest") -> "ScorerAgent.ScoreResponse":
        out = await self.score(req.prompt, prefer=req.prefer)
        return ScorerAgent.ScoreResponse(
            score=out.score,
            rationale=out.rationale,
            provider=out.provider,
            model=out.model,
            cited_clauses=out.cited_clauses,
        )

    def health(self) -> Dict[str, Any]:
        try:
            # Router existence check; avoid network calls
            ok = self.router is not None
            # Expose default provider preferences from router/settings if available
            info: Dict[str, Any] = {"ok": ok}
        except Exception as e:
            return {"ok": False, "error": str(e)}
        return info
