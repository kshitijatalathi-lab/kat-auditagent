from __future__ import annotations

from typing import Any, Dict, List

from .base_agent import BaseAgent


class GapAgent(BaseAgent):
    """Detects gaps by filtering items below a threshold score."""

    def name(self) -> str:
        return "gap"

    def find_gaps(self, items: List[Dict[str, Any]], *, min_score: int = 3) -> List[Dict[str, Any]]:
        gaps: List[Dict[str, Any]] = []
        for it in items:
            try:
                score = int(it.get("score", 0))
            except Exception:
                score = 0
            if score < min_score:
                gaps.append(it)
        return gaps
