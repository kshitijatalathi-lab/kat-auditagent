from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class MCPContext:
    """Lightweight context container for MCP-integrated flows.

    Carries per-request metadata such as session identifiers, org ids, and
    arbitrary tags. Extend as needed when wiring real MCP servers.
    """

    session_id: str = "default"
    org_id: Optional[str] = None
    tags: Dict[str, str] = field(default_factory=dict)
