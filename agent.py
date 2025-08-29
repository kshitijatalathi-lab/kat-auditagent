#!/usr/bin/env python3
from __future__ import annotations

import argparse
from typing import Optional, Tuple, List

from smartaudit.rag_cli import answer_query  # reuse retrieval + generation
from smartaudit.logging_utils import collect_feedback, log_feedback


class AuditAgent:
    def __init__(self, audit_type: str = "data_privacy", provider: str = "auto", model_dir: Optional[str] = None,
                 k: int = 8, pre_k: Optional[int] = 40, rerank: bool = True, openai_model: str = "gpt-3.5-turbo",
                 max_new_tokens: int = 300):
        self.audit_type = audit_type
        self.current_step = 0
        self.responses: List[str] = []
        self.questions: List[str] = []
        self.provider = provider
        self.model_dir = model_dir or "smartaudit/models/smartaudit-gemma"
        self.k = k
        self.pre_k = pre_k
        self.rerank = rerank
        self.openai_model = openai_model
        self.max_new_tokens = max_new_tokens
        self.load_checklist()

    def load_checklist(self) -> None:
        if self.audit_type == "data_privacy":
            from smartaudit.audit_flows.data_privacy import audit_checklist
        elif self.audit_type == "financial":
            from smartaudit.audit_flows.financial_audit import audit_checklist
        else:
            from smartaudit.audit_flows.data_privacy import audit_checklist
        self.questions = audit_checklist

    def get_next_question(self) -> Optional[str]:
        if self.current_step < len(self.questions):
            return self.questions[self.current_step]
        return None

    def answer_question(self, user_response: str) -> None:
        self.responses.append(user_response)
        self.current_step += 1

    def assess_response(self, user_response: str, audit_question: str) -> str:
        full_prompt = (
            f'The user was asked: "{audit_question}".\n'
            f'They responded: "{user_response}".\n\n'
            "Evaluate their answer from a compliance perspective. "
            "Provide constructive feedback and explain what good compliance would look like."
        )
        answer, _ = answer_query(
            query=full_prompt,
            k=self.k,
            provider=self.provider,
            model_dir=self.model_dir,
            max_new_tokens=self.max_new_tokens,
            openai_model=self.openai_model,
            rerank=self.rerank,
            pre_k=self.pre_k,
        )
        return answer

    def generate_summary(self) -> str:
        summary_input = "\n".join(
            [f"Q: {q}\nA: {a}" for q, a in zip(self.questions, self.responses)]
        )
        prompt = (
            "Here is an audit session between an auditor and a company representative:\n\n"
            f"{summary_input}\n\n"
            "Summarize the key compliance strengths and gaps. Provide clear recommendations."
        )
        answer, _ = answer_query(
            query=prompt,
            k=self.k,
            provider=self.provider,
            model_dir=self.model_dir,
            max_new_tokens=self.max_new_tokens,
            openai_model=self.openai_model,
            rerank=self.rerank,
            pre_k=self.pre_k,
        )
        return answer


def run_cli():
    parser = argparse.ArgumentParser(description="SmartAudit Simulation Agent")
    parser.add_argument("--audit-type", choices=["data_privacy", "financial"], default="data_privacy")
    parser.add_argument("--provider", choices=["auto", "local", "openai"], default="auto")
    parser.add_argument("--model-dir", type=str, default="smartaudit/models/smartaudit-gemma")
    parser.add_argument("--openai-model", type=str, default="gpt-3.5-turbo")
    parser.add_argument("--k", type=int, default=8)
    parser.add_argument("--pre-k", dest="pre_k", type=int, default=40)
    parser.add_argument("--no-rerank", action="store_true")
    parser.add_argument("--max-new-tokens", type=int, default=300)

    args = parser.parse_args()

    agent = AuditAgent(
        audit_type=args.audit_type,
        provider=args.provider,
        model_dir=args.model_dir,
        k=args.k,
        pre_k=args.pre_k,
        rerank=not args.no_rerank,
        openai_model=args.openai_model,
        max_new_tokens=args.max_new_tokens,
    )

    print(f"\n🚀 Starting {agent.audit_type.replace('_',' ').title()} Simulation. Answer honestly; type 'quit' to exit.\n")

    while True:
        q = agent.get_next_question()
        if not q:
            break
        print(f"📋 Audit Question: {q}")
        user_input = input("Your response: ")
        if user_input.strip().lower() in {"quit", "exit"}:
            break
        agent.answer_question(user_input)
        feedback = agent.assess_response(user_input, q)
        print("\n🤖 Compliance Assistant says:\n", feedback, "\n")
        # Optional feedback collection per turn
        fb = collect_feedback()
        try:
            log_feedback(
                query=q,
                rating=fb.get("rating"),
                comment=fb.get("comment", ""),
                meta={
                    "audit_type": agent.audit_type,
                    "step": agent.current_step,
                },
            )
        except Exception:
            pass

    print("\n🧾 Generating end-of-audit summary...\n")
    summary = agent.generate_summary()
    print(summary)


if __name__ == "__main__":
    run_cli()
