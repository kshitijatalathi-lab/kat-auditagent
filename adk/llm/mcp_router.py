from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import json
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

    async def generate(self, prompt: str, prefer: Optional[str] = None, temperature: float = 0.2) -> Optional[LLMResponse]:
        # Dynamic order based on preference
        eff_prefer = (prefer or self.prefer or "auto").lower()
        order = ["gemini", "openai", "groq"]
        if eff_prefer in order:
            order.remove(eff_prefer)
            order.insert(0, eff_prefer)
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

    async def generate_stream(self, prompt: str, chunk_size: int = 80, prefer: Optional[str] = None, temperature: float = 0.2):
        """Async generator yielding text chunks.

        Tries provider-native SSE streaming for OpenAI and Groq. Falls back to
        non-streaming generate() split into chunks if streaming isn't available.
        """
        # Build preference order
        eff_prefer = (prefer or self.prefer or "auto").lower()
        order = ["gemini", "openai", "groq"]
        if eff_prefer in order:
            order.remove(eff_prefer)
            order.insert(0, eff_prefer)

        # 1) Try provider-native streaming where possible
        for p in order:
            if p == "openai":
                api_key = os.getenv("OPENAI_API_KEY")
                if api_key:
                    url = "https://api.openai.com/v1/chat/completions"
                    model_name = settings.openai_model
                    try:
                        async with httpx.AsyncClient(timeout=120) as client:
                            payload = {
                                "model": model_name,
                                "messages": [
                                    {"role": "system", "content": "You are a helpful assistant."},
                                    {"role": "user", "content": prompt},
                                ],
                                "temperature": float(temperature),
                                "stream": True,
                            }
                            async with client.stream(
                                "POST",
                                url,
                                headers={
                                    "Authorization": f"Bearer {api_key}",
                                    "Content-Type": "application/json",
                                },
                                json=payload,
                            ) as r:
                                if r.status_code == 200:
                                    async for line in r.aiter_lines():
                                        if not line:
                                            continue
                                        if line.startswith("data: "):
                                            data = line[len("data: "):].strip()
                                            if data == "[DONE]":
                                                break
                                            try:
                                                obj = json.loads(data)
                                                delta = ((obj.get("choices") or [{}])[0].get("delta") or {}).get("content")
                                                if delta:
                                                    yield delta
                                            except Exception:
                                                # ignore malformed chunk
                                                pass
                                    return
                    except Exception:
                        # Fall through to next provider
                        pass
            elif p == "groq":
                api_key = os.getenv("GROQ_API_KEY")
                if api_key:
                    url = "https://api.groq.com/openai/v1/chat/completions"
                    model_name = settings.groq_model
                    try:
                        async with httpx.AsyncClient(timeout=120) as client:
                            payload = {
                                "model": model_name,
                                "messages": [
                                    {"role": "system", "content": "You are a helpful assistant."},
                                    {"role": "user", "content": prompt},
                                ],
                                "temperature": float(temperature),
                                "stream": True,
                            }
                            async with client.stream(
                                "POST",
                                url,
                                headers={
                                    "Authorization": f"Bearer {api_key}",
                                    "Content-Type": "application/json",
                                },
                                json=payload,
                            ) as r:
                                if r.status_code == 200:
                                    async for line in r.aiter_lines():
                                        if not line:
                                            continue
                                        if line.startswith("data: "):
                                            data = line[len("data: "):].strip()
                                            if data == "[DONE]":
                                                break
                                            try:
                                                obj = json.loads(data)
                                                delta = ((obj.get("choices") or [{}])[0].get("delta") or {}).get("content")
                                                if delta:
                                                    yield delta
                                            except Exception:
                                                pass
                                    return
                    except Exception:
                        pass
            else:
                # Gemini: Python SDK async streaming support may not be available in this env.
                # We keep explicit branch for clarity and fall through to fallback chunking below.
                continue

        # 2) Fallback to non-streaming and chunk output
        res = await self.generate(prompt, prefer=prefer, temperature=temperature)
        text = (res.text if res else "") or ""
        for i in range(0, len(text), chunk_size):
            yield text[i : i + chunk_size]
