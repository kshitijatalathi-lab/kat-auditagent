from __future__ import annotations

import os

from .context import MCPContext


class GDriveClient:
    """Wrapper around @isaacphi/mcp-gdrive.

    In production, connect to the MCP server and invoke tools to read files
    from Google Drive. In mock mode, return deterministic example content.
    """

    def __init__(self, ctx: MCPContext) -> None:
        self.ctx = ctx
        self.endpoint = os.getenv("MCP_GDRIVE_URL", "http://localhost:8787")

    async def read_pdf(self, file_id: str) -> str:
        # Mock mode for local testing
        if os.getenv("LLM_MOCK", "").lower() in {"1", "true", "yes"}:
            return (
                "Sample PDF content about data protection, encryption, access controls, and compliance.\n"
                "This simulates text extracted from a Google Drive PDF via mcp-gdrive."
            )
        # TODO: Implement real MCP gdrive integration
        raise NotImplementedError("Real MCP gdrive integration not yet implemented.")
