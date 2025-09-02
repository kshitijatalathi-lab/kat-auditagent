from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import os
import httpx

from adk.config import settings

try:
    import google.generativeai as genai  # type: ignore
except Exception:
    genai = None  # type: ignore

try:
    from openai import OpenAI  # type: ignore
except Exception:
    OpenAI = None  # type: ignore


@dataclass
class LLMResponse:
    text: str
    provider: str
    model: str


class LLMRouter:
    """MCP-like dynamic router over multiple providers (remote only).

    Preference order: Gemini -> OpenAI -> Groq (reordered by LLM_PROVIDER).
    """

    def __init__(self) -> None:
        self.prefer = settings.prefer

    async def _gemini(self, prompt: str) -> Optional[LLMResponse]:
        if genai is None:
            return None
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return None
        try:
            genai.configure(api_key=api_key)
            model_name = settings.gemini_model
            model = genai.GenerativeModel(model_name)
            resp = await model.generate_content_async(prompt)
            txt = resp.text or ""
            return LLMResponse(text=txt, provider="gemini", model=model_name)
        except Exception:
            return None

    async def _openai(self, prompt: str) -> Optional[LLMResponse]:
        if OpenAI is None:
            return None
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        try:
            client = OpenAI(api_key=api_key)
            model_name = settings.openai_model
            resp = await client.chat.completions.create_async(
                model=model_name,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
            )
            txt = resp.choices[0].message.content if resp and resp.choices else ""
            return LLMResponse(text=txt or "", provider="openai", model=model_name)
        except Exception:
            return None


    async def _groq(self, prompt: str) -> Optional[LLMResponse]:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return None
        model_name = settings.groq_model
        url = "https://api.groq.com/openai/v1/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                r = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model_name,
                        "messages": [
                            {"role": "system", "content": "You are a helpful assistant."},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.2,
                    },
                )
                if r.status_code != 200:
                    return None
                data = r.json()
                content = (
                    (data.get("choices") or [{}])[0]
                    .get("message", {})
                    .get("content", "")
                )
                return LLMResponse(text=content or "", provider="groq", model=model_name)
        except Exception:
            return None

    async def generate(self, prompt: str) -> Optional[LLMResponse]:
        # Dynamic order based on preference
        order = ["gemini", "openai", "groq"]
        if self.prefer in order:
            order.remove(self.prefer)
            order.insert(0, self.prefer)
        for p in order:
            if p == "gemini":
                r = await self._gemini(prompt)
            elif p == "openai":
                r = await self._openai(prompt)
            elif p == "groq":
                r = await self._groq(prompt)
            if r and r.text:
                return r
        return None
