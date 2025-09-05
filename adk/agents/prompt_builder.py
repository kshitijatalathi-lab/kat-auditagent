from __future__ import annotations

from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from adk.prompts.templates import build_scorer_prompt


@dataclass
class PromptBundle:
    prompt: str
    clauses: List[Dict]


class PromptBuilderAgent:
    class BuildRequest(BaseModel):
        checklist_question: str
        user_answer: str
        clauses: List[Dict[str, Any]]

    class BuildResponse(BaseModel):
        prompt: str
        clauses: List[Dict[str, Any]]

    def build(self, checklist_question: str, user_answer: str, clauses: List[Dict]) -> PromptBundle:
        prompt = build_scorer_prompt(checklist_question, user_answer, clauses)
        return PromptBundle(prompt=prompt, clauses=clauses)

    def build_structured(self, req: "PromptBuilderAgent.BuildRequest") -> "PromptBuilderAgent.BuildResponse":
        out = self.build(req.checklist_question, req.user_answer, req.clauses)
        return PromptBuilderAgent.BuildResponse(prompt=out.prompt, clauses=out.clauses)

    def health(self) -> Dict[str, Optional[str]]:
        try:
            # Simple template smoke check
            sample = build_scorer_prompt("Q?", "A", [])
            ok = bool(sample and isinstance(sample, str))
        except Exception:
            ok = False
        return {
            "ok": "true" if ok else "false",
            "template": "build_scorer_prompt",
        }
