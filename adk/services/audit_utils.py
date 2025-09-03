from __future__ import annotations

import os
from typing import Dict, Any


def framework_for_policy_type(policy_type: str) -> str:
    pt = (policy_type or "").strip().lower()
    framework_map = {
        "hr": "GDPR",
        "posh": "GDPR",
        "gdpr": "GDPR",
        "dpdp": "DPDP",
        "hipaa": "HIPAA",
    }
    return framework_map.get(pt, (pt.upper() if pt else "GDPR"))


def clamp_top_k(k: int, lo: int = 3, hi: int = 30) -> int:
    try:
        return max(lo, min(int(k), hi))
    except Exception:
        return lo


def normalize_question(item: Dict[str, Any]) -> str:
    return item.get("question") or item.get("title") or item.get("text") or ""


def stable_session_id(org_id: str, file_path: str) -> str:
    return f"audit:{org_id}:{os.path.basename(file_path)}"
