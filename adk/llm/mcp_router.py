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
    from openai import AsyncOpenAI  # type: ignore
except Exception:
    AsyncOpenAI = None  # type: ignore


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

    def _debug(self, msg: str) -> None:
        if os.getenv("LLM_DEBUG"):
            print(f"[LLMRouter] {msg}")

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
        if AsyncOpenAI is None:
            self._debug("OpenAI SDK not available")
            return None
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            self._debug("OPENAI_API_KEY missing")
            return None
        try:
            client = AsyncOpenAI(api_key=api_key)
            model_name = settings.openai_model
            resp = await client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
            )
            txt = ""
            if getattr(resp, "choices", None):
                choice0 = resp.choices[0]
                # OpenAI python returns objects; access defensively
                msg = getattr(choice0, "message", None)
                if msg:
                    txt = getattr(msg, "content", "") or ""
            if not txt:
                self._debug("OpenAI returned empty content")
            return LLMResponse(text=txt or "", provider="openai", model=model_name)
        except Exception as e:
            self._debug(f"OpenAI error: {e}")
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
                    self._debug(f"Groq HTTP {r.status_code}: {r.text[:200]}")
                    return None
                data = r.json()
                content = ""
                choices = data.get("choices") or []
                if choices:
                    ch0 = choices[0]
                    # Groq OpenAI-compatible responses usually have message.content
                    content = (
                        (ch0.get("message") or {}).get("content")
                        or ch0.get("text", "")
                        or ""
                    )
                if not content:
                    self._debug("Groq returned empty content")
                return LLMResponse(text=(content or ""), provider="groq", model=model_name)
        except Exception as e:
            self._debug(f"Groq error: {e}")
            return None

    async def generate(self, prompt: str, prefer: Optional[str] = None, temperature: float = 0.2) -> Optional[LLMResponse]:
        # Mock mode: avoid external tokens and return canned output
        if os.getenv("LLM_MOCK", "0").lower() in {"1", "true", "yes"}:
            return LLMResponse(text=f"MOCK: {prompt}", provider="mock", model="mock")
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
        # Mock mode: stream a short canned response
        if os.getenv("LLM_MOCK", "0").lower() in {"1", "true", "yes"}:
            msg = f"MOCK: {prompt}"
            for i in range(0, len(msg), chunk_size):
                yield msg[i : i + chunk_size]
            return
        
        # Fallback mode: provide helpful response when no API keys available
        if not any([
            os.getenv("OPENAI_API_KEY"),
            os.getenv("GROQ_API_KEY"), 
            os.getenv("GOOGLE_API_KEY"),
            os.getenv("GEMINI_API_KEY")
        ]):
            msg = "I'm a compliance and audit assistant. I can help you understand regulatory frameworks like GDPR, HIPAA, and DPDP. I can assist with policy analysis, gap identification, and compliance requirements. However, I need API keys configured to provide detailed responses. Please configure LLM provider credentials or enable mock mode for testing."
            for i in range(0, len(msg), chunk_size):
                yield msg[i : i + chunk_size]
            return
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
                                    yielded_any = False
                                    async for line in r.aiter_lines():
                                        if not line:
                                            continue
                                        if line.startswith("data: "):
                                            data = line[len("data: "):].strip()
                                            if data == "[DONE]":
                                                break
                                            try:
                                                obj = json.loads(data)
                                                choice0 = (obj.get("choices") or [{}])[0]
                                                delta = (choice0.get("delta") or {}).get("content")
                                                if delta:
                                                    yielded_any = True
                                                    yield delta
                                                else:
                                                    # Some providers may send full message content in stream chunks
                                                    msg_content = (choice0.get("message") or {}).get("content")
                                                    if msg_content:
                                                        yielded_any = True
                                                        yield msg_content
                                            except Exception:
                                                # ignore malformed chunk
                                                pass
                                    if not yielded_any:
                                        # Fallback: try non-streaming
                                        res = await self.generate(prompt, prefer=prefer, temperature=temperature)
                                        txt = (res.text if res else "") or ""
                                        if txt:
                                            yield txt
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
                                    yielded_any = False
                                    async for line in r.aiter_lines():
                                        if not line:
                                            continue
                                        if line.startswith("data: "):
                                            data = line[len("data: "):].strip()
                                            if data == "[DONE]":
                                                break
                                            try:
                                                obj = json.loads(data)
                                                choice0 = (obj.get("choices") or [{}])[0]
                                                delta = (choice0.get("delta") or {}).get("content")
                                                if delta:
                                                    yielded_any = True
                                                    yield delta
                                                else:
                                                    msg_content = (choice0.get("message") or {}).get("content") or obj.get("text")
                                                    if msg_content:
                                                        yielded_any = True
                                                        yield msg_content
                                            except Exception:
                                                pass
                                    if not yielded_any:
                                        # Fallback to non-streaming single shot
                                        res = await self.generate(prompt, prefer=prefer, temperature=temperature)
                                        txt = (res.text if res else "") or ""
                                        if txt:
                                            yield txt
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
