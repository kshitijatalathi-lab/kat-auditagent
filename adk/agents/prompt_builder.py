from __future__ import annotations

from dataclasses import dataclass
from typing import List, Dict

from adk.prompts.templates import build_scorer_prompt


@dataclass
class PromptBundle:
    prompt: str
    clauses: List[Dict]


class PromptBuilderAgent:
    def build(self, checklist_question: str, user_answer: str, clauses: List[Dict]) -> PromptBundle:
        prompt = build_scorer_prompt(checklist_question, user_answer, clauses)
        return PromptBundle(prompt=prompt, clauses=clauses)
