from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from adk.config import settings
from adk.orchestrator import Orchestrator
from adk.llm.mcp_router import LLMRouter
from adk.services.audit_utils import (
    framework_for_policy_type,
    clamp_top_k,
    normalize_question,
    stable_session_id,
)
from adk.services.report_writer import write_audit_pdf


class PolicyAuditPipeline:
    def __init__(self, *, orchestrator: Optional[Orchestrator] = None, llm: Optional[LLMRouter] = None) -> None:
        self._orch = orchestrator or Orchestrator()
        self._llm = llm or LLMRouter()

    async def run(
        self,
        *,
        file_path: str,
        org_id: str,
        policy_type: Optional[str] = None,
        top_k: int = 8,
        prefer: Optional[str] = None,
    ) -> Dict[str, Any]:
        # classify
        ptype = (policy_type or "").strip().lower()
        if not ptype:
            name = os.path.basename(file_path).lower()
            if "posh" in name:
                ptype = "posh"
            elif "hr" in name:
                ptype = "hr"
            else:
                ptype = "general"

        # validate file exists (best-effort)
        try:
            if not Path(file_path).exists():
                pass
        except Exception:
            pass

        # discover corpus from data/company_policies/india to ground retrieval and checklist generation
        corpus_files: List[str] = []
        try:
            base = settings.root / "data" / "company_policies" / "india"
            txt_dir = base / "txt"
            candidates: List[Path] = []
            if base.exists():
                # prefer text conversions if available
                if txt_dir.exists():
                    candidates.extend(list(txt_dir.rglob("*.txt")))
                # also include any PDFs or TXT directly under base
                candidates.extend(list(base.rglob("*.pdf")))
                candidates.extend(list(base.rglob("*.txt")))
            # de-duplicate while preserving order and cap to avoid huge indexes
            seen: set[str] = set()
            for p in candidates:
                sp = str(p.resolve())
                if sp not in seen:
                    seen.add(sp)
                    corpus_files.append(sp)
            # limit to a reasonable number of corpus docs
            corpus_files = corpus_files[:50]
        except Exception:
            corpus_files = []

        # index uploaded file plus corpus (best-effort)
        try:
            self._orch.index_documents([file_path] + corpus_files)
        except Exception:
            pass

        # checklist
        framework = framework_for_policy_type(ptype)
        topn = clamp_top_k(top_k)
        try:
            # Use uploaded file together with India corpus to select the most relevant checklist items
            gen = self._orch.generate_checklist(framework=framework, files=[file_path] + corpus_files, top_n=topn)
            checklist: List[Dict[str, Any]] = gen.get("items", [])
        except Exception:
            checklist = []

        # batch scoring
        items = []
        for it in checklist:
            q = normalize_question(it)
            if q:
                items.append({"question": q, "user_answer": ""})

        composite = 0.0
        scores: List[Dict[str, Any]] = []
        if items:
            sid = stable_session_id(org_id, file_path)
            try:
                out = await self._orch.score_batch(
                    session_id=sid,
                    org_id=org_id,
                    user_id="system",
                    framework=framework,
                    items=items,
                    k=topn,
                    prefer=prefer,
                )
            except TypeError:
                # DummyOrchestrator in tests may not accept prefer
                out = await self._orch.score_batch(
                    session_id=sid,
                    org_id=org_id,
                    user_id="system",
                    framework=framework,
                    items=items,
                    k=topn,
                )
            scores = out.get("items", [])
            try:
                composite = float(out.get("composite_score", 0.0))
            except Exception:
                composite = 0.0

        # gaps
        gaps: List[Dict[str, Any]] = []
        if scores:
            gaps_out = self._orch.compute_gaps(scored_items=scores, min_score=4)
            gaps = gaps_out.get("items", [])

        # annotate
        annotated_rel = None
        annotated_url = None
        try:
            annotated_out = self._orch.annotate_policy(
                file=file_path,
                gaps=gaps,
                out_path=str((settings.root / "reports" / f"{Path(file_path).stem}.annotated.pdf").resolve()),
            )
            annotated_abs = Path(annotated_out.get("annotated_path", ""))
            if annotated_abs.exists():
                try:
                    annotated_rel = str(annotated_abs.relative_to(settings.root))
                except Exception:
                    annotated_rel = str(annotated_abs)
                annotated_url = f"/reports/{annotated_abs.name}"
        except Exception:
            annotated_rel = None
            annotated_url = None

        # corrected draft via LLM
        corrected_draft: Optional[str] = None
        try:
            if gaps:
                gap_bullets = "\n".join([f"- {g.get('question','')}: {g.get('suggestion','')}" for g in gaps[:8]])
                citations: List[str] = []
                try:
                    for it in scores:
                        cl = (it.get("clauses") or [])
                        if cl:
                            c0 = cl[0]
                            src = c0.get("source") or c0.get("title") or c0.get("id") or "clause"
                            excerpt = (c0.get("text") or c0.get("content") or "").strip().replace("\n", " ")
                            if excerpt:
                                excerpt = excerpt[:220] + ("…" if len(excerpt) > 220 else "")
                            citations.append(f"- {src}: {excerpt}")
                            if len(citations) >= 8:
                                break
                except Exception:
                    citations = []
                citations_block = "\n".join(citations)
                prompt = (
                    "You are a compliance policy editor. Based on the following gaps, draft succinct corrected policy paragraphs "
                    "(2-4 sentences each) suitable to insert into the organization's policy. Use clear, neutral tone. "
                    "Return one section per bullet, prefixed with 'Section:' and keep total under 800 words. "
                    "When appropriate, reference the provided citations inline in square brackets (e.g., [GDPR Art. 5]).\n\n"
                    f"GAPS:\n{gap_bullets}\n\n"
                    f"CITATIONS:\n{citations_block}\n\n"
                    "Corrected Draft:\n"
                )
                llm_res = await self._llm.generate(prompt, prefer=prefer)
                if llm_res and llm_res.text:
                    corrected_draft = llm_res.text.strip()
        except Exception:
            corrected_draft = None

        # report PDF
        try:
            out_pdf = write_audit_pdf(
                policy_file_path=file_path,
                policy_type=ptype,
                composite=composite,
                checklist=checklist,
                scores=scores,
                gaps=gaps,
                corrected_draft=corrected_draft,
            )
            report_rel = out_pdf.get("report_path")
            download_url = out_pdf.get("download_url")
        except Exception:
            report_rel = None
            download_url = None

        return {
            "policy_type": ptype,
            "composite": composite,
            "checklist": checklist,
            "scores": scores,
            "gaps": gaps,
            "report_path": report_rel,
            "download_url": download_url,
            "annotated_path": annotated_rel,
            "annotated_url": annotated_url,
            "corrected_draft": corrected_draft,
        }

    async def run_stream(
        self,
        *,
        file_path: str,
        org_id: str,
        policy_type: Optional[str] = None,
        top_k: int = 8,
        prefer: Optional[str] = None,
    ):
        """Async generator that yields progress events for the audit pipeline.

        Yields dict events with shape: {"stage": str, "data": any}
        Final event includes the full output with stage="final".
        """
        # classify
        ptype = (policy_type or "").strip().lower()
        if not ptype:
            name = os.path.basename(file_path).lower()
            if "posh" in name:
                ptype = "posh"
            elif "hr" in name:
                ptype = "hr"
            else:
                ptype = "general"
        yield {"stage": "classify", "data": {"policy_type": ptype}}

        # validate file exists (best-effort)
        try:
            exists = Path(file_path).exists()
        except Exception:
            exists = False
        yield {"stage": "file_check", "data": {"file_path": file_path, "exists": bool(exists)}}

        # discover corpus
        corpus_files: List[str] = []
        try:
            base = settings.root / "data" / "company_policies" / "india"
            txt_dir = base / "txt"
            candidates: List[Path] = []
            if base.exists():
                if txt_dir.exists():
                    candidates.extend(list(txt_dir.rglob("*.txt")))
                candidates.extend(list(base.rglob("*.pdf")))
                candidates.extend(list(base.rglob("*.txt")))
            seen: set[str] = set()
            for p in candidates:
                sp = str(p.resolve())
                if sp not in seen:
                    seen.add(sp)
                    corpus_files.append(sp)
            corpus_files = corpus_files[:50]
        except Exception:
            corpus_files = []
        yield {"stage": "discover_corpus", "data": {"count": len(corpus_files)}}

        # index uploaded + corpus
        try:
            self._orch.index_documents([file_path] + corpus_files)
            yield {"stage": "index", "data": {"ok": True, "files_indexed": 1 + len(corpus_files)}}
        except Exception as e:
            yield {"stage": "index", "data": {"ok": False, "error": str(e)}}

        # checklist
        framework = framework_for_policy_type(ptype)
        topn = clamp_top_k(top_k)
        try:
            gen = self._orch.generate_checklist(framework=framework, files=[file_path] + corpus_files, top_n=topn)
            checklist: List[Dict[str, Any]] = gen.get("items", [])
        except Exception:
            checklist = []
        yield {"stage": "checklist", "data": {"framework": framework, "count": len(checklist)}}

        # batch scoring
        items = []
        for it in checklist:
            q = normalize_question(it)
            if q:
                items.append({"question": q, "user_answer": ""})

        composite = 0.0
        scores: List[Dict[str, Any]] = []
        if items:
            sid = stable_session_id(org_id, file_path)
            yield {"stage": "score_start", "data": {"items": len(items), "session_id": sid, "k": topn}}
            try:
                out = await self._orch.score_batch(
                    session_id=sid,
                    org_id=org_id,
                    user_id="system",
                    framework=framework,
                    items=items,
                    k=topn,
                    prefer=prefer,
                )
            except TypeError:
                out = await self._orch.score_batch(
                    session_id=sid,
                    org_id=org_id,
                    user_id="system",
                    framework=framework,
                    items=items,
                    k=topn,
                )
            scores = out.get("items", [])
            try:
                composite = float(out.get("composite_score", 0.0))
            except Exception:
                composite = 0.0
            yield {"stage": "score_done", "data": {"items": len(scores), "composite": composite}}
        else:
            yield {"stage": "score_skipped", "data": {"reason": "no_items"}}

        # gaps
        gaps: List[Dict[str, Any]] = []
        if scores:
            gaps_out = self._orch.compute_gaps(scored_items=scores, min_score=4)
            gaps = gaps_out.get("items", [])
        yield {"stage": "gaps", "data": {"count": len(gaps)}}

        # annotate
        annotated_rel = None
        annotated_url = None
        try:
            annotated_out = self._orch.annotate_policy(
                file=file_path,
                gaps=gaps,
                out_path=str((settings.root / "reports" / f"{Path(file_path).stem}.annotated.pdf").resolve()),
            )
            annotated_abs = Path(annotated_out.get("annotated_path", ""))
            if annotated_abs.exists():
                try:
                    annotated_rel = str(annotated_abs.relative_to(settings.root))
                except Exception:
                    annotated_rel = str(annotated_abs)
                annotated_url = f"/reports/{annotated_abs.name}"
        except Exception:
            annotated_rel = None
            annotated_url = None
        yield {"stage": "annotate", "data": {"annotated_path": annotated_rel, "annotated_url": annotated_url}}

        # corrected draft
        corrected_draft: Optional[str] = None
        try:
            if gaps:
                gap_bullets = "\n".join([f"- {g.get('question','')}: {g.get('suggestion','')}" for g in gaps[:8]])
                citations: List[str] = []
                try:
                    for it in scores:
                        cl = (it.get("clauses") or [])
                        if cl:
                            c0 = cl[0]
                            src = c0.get("source") or c0.get("title") or c0.get("id") or "clause"
                            excerpt = (c0.get("text") or c0.get("content") or "").strip().replace("\n", " ")
                            if excerpt:
                                excerpt = excerpt[:220] + ("…" if len(excerpt) > 220 else "")
                            citations.append(f"- {src}: {excerpt}")
                            if len(citations) >= 8:
                                break
                except Exception:
                    citations = []
                citations_block = "\n".join(citations)
                prompt = (
                    "You are a compliance policy editor. Based on the following gaps, draft succinct corrected policy paragraphs "
                    "(2-4 sentences each) suitable to insert into the organization's policy. Use clear, neutral tone. "
                    "Return one section per bullet, prefixed with 'Section:' and keep total under 800 words. "
                    "When appropriate, reference the provided citations inline in square brackets (e.g., [GDPR Art. 5]).\n\n"
                    f"GAPS:\n{gap_bullets}\n\n"
                    f"CITATIONS:\n{citations_block}\n\n"
                    "Corrected Draft:\n"
                )
                llm_res = await self._llm.generate(prompt, prefer=prefer)
                if llm_res and llm_res.text:
                    corrected_draft = llm_res.text.strip()
        except Exception:
            corrected_draft = None
        yield {"stage": "corrected_draft", "data": {"present": bool(corrected_draft)}}

        # report
        try:
            out_pdf = write_audit_pdf(
                policy_file_path=file_path,
                policy_type=ptype,
                composite=composite,
                checklist=checklist,
                scores=scores,
                gaps=gaps,
                corrected_draft=corrected_draft,
            )
            report_rel = out_pdf.get("report_path")
            download_url = out_pdf.get("download_url")
        except Exception:
            report_rel = None
            download_url = None
        yield {"stage": "report", "data": {"report_path": report_rel, "download_url": download_url}}

        # final
        yield {
            "stage": "final",
            "data": {
                "policy_type": ptype,
                "composite": composite,
                "checklist": checklist,
                "scores": scores,
                "gaps": gaps,
                "report_path": report_rel,
                "download_url": download_url,
                "annotated_path": annotated_rel,
                "annotated_url": annotated_url,
                "corrected_draft": corrected_draft,
            },
        }
