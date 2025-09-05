from __future__ import annotations

from typing import List

from .base_agent import BaseAgent


class ChunkingAgent(BaseAgent):
    """Simple word-based chunker with overlap.

    Splits text into ~250-word chunks with 50-word overlap.
    """

    def __init__(self, *, chunk_size: int = 250, overlap: int = 50) -> None:
        self.chunk_size = max(1, chunk_size)
        self.overlap = max(0, overlap)

    def name(self) -> str:
        return "chunking"

    def chunk_text(self, text: str) -> List[str]:
        words = text.split()
        if not words:
            return []
        chunks: List[str] = []
        i = 0
        while i < len(words):
            chunk_words = words[i : i + self.chunk_size]
            chunks.append(" ".join(chunk_words))
            if i + self.chunk_size >= len(words):
                break
            i += self.chunk_size - self.overlap
            if i < 0:
                i = 0
        return chunks
