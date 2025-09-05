from __future__ import annotations

from typing import Any, Dict, List

from .base_agent import BaseAgent


class ReportAgent(BaseAgent):
    """Produces a simple structured summary from scored items."""

    def name(self) -> str:
        return "report"

    def summarize(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        total = 0
        count = 0
        for it in items:
            try:
                total += int(it.get("score", 0))
                count += 1
            except Exception:
                pass
        composite = (total / count) if count else 0.0
        gaps = [it for it in items if int(it.get("score", 0)) < 3]
        return {
            "composite_score": composite,
            "items_count": count,
            "gaps_count": len(gaps),
            "items": items,
        }
