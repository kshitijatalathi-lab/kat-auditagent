from __future__ import annotations

from typing import List, Dict


SYSTEM_PROMPT = "You are a legal compliance auditor."


def build_scorer_prompt(checklist_question: str, user_answer: str, clauses: List[Dict]) -> str:
    lines: List[str] = []
    lines.append("System:\n" + SYSTEM_PROMPT)
    lines.append("User:")
    lines.append(f"Checklist Question: {checklist_question}")
    lines.append(f"User Answer: {user_answer}")
    lines.append("Relevant Legal Clauses:")
    for c in clauses:
        law = c.get("law") or c.get("framework", "LAW")
        article = c.get("article", "?")
        text = c.get("clause_text") or c.get("text") or c.get("content") or ""
        cid = c.get("clause_id") or c.get("id") or ""
        lines.append(f"[{law}.{article}#{cid}]: {text}")
    lines.append("\nInstruction:\nScore the organization from 0 (non-compliant) to 5 (fully compliant) and explain your rationale based on the clauses. Include cited clause IDs.")
    return "\n".join(lines)
