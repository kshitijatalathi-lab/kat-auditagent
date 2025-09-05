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
    lines.append(
        "\nInstruction:\n"
        "1) Score the organization from 0 (non-compliant) to 5 (fully compliant).\n"
        "2) Provide a concise rationale that directly quotes or paraphrases the most relevant clauses.\n"
        "3) Explicitly cite clause IDs inline using the exact format [LAW.ARTICLE#CLAUSE_ID].\n"
        "4) End with a separate line starting with 'Citations:' followed by a comma-separated list of unique clause IDs in the same format.\n"
        "Keep the rationale crisp (3-6 sentences)."
    )
    return "\n".join(lines)


def build_report_summary_prompt(items: List[Dict]) -> str:
    """Create an executive summary prompt from scored report items.

    Each item is expected to have: question, user_answer, score, rationale, clauses.
    """
    lines: List[str] = []
    lines.append("System:\n" + SYSTEM_PROMPT)
    lines.append("User:")
    lines.append("Generate an executive summary of the audit results.\n")
    lines.append("Items:")
    for i, it in enumerate(items, start=1):
        q = str(it.get("question", "")).strip()
        a = str(it.get("user_answer", "")).strip()
        s = it.get("score")
        r = str(it.get("rationale", "")).strip()
        lines.append(f"- [{i}] Q: {q}\n  Answer: {a}\n  Score: {s}\n  Rationale: {r}")
    lines.append(
        "\nInstruction:\n"
        "Write a concise executive summary with:\n"
        "1) Overall compliance assessment (0-5) and brief justification.\n"
        "2) Top strengths (bullet points).\n"
        "3) Key gaps and their impact (bullet points).\n"
        "4) Actionable next steps prioritized by impact.\n"
        "Keep it under 200-300 words, use clear bullets, and avoid generic statements."
    )
    return "\n".join(lines)
