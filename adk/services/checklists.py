from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Any
import yaml

from adk.config import settings

CK_DIR = settings.root / "adk" / "checklists"


def list_frameworks() -> List[str]:
    return [p.stem for p in CK_DIR.glob("*.yaml")]


def load_checklist(framework: str) -> Dict[str, Any]:
    path = CK_DIR / f"{framework.lower()}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"Checklist not found: {framework}")
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)
