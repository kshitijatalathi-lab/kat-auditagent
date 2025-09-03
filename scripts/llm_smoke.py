from __future__ import annotations

import asyncio
import os
from adk.llm.mcp_router import LLMRouter, LLMResponse


async def main():
    prompt = "Say 'ok' and nothing else."
    # Mock path: avoid any external calls
    if os.getenv("LLM_MOCK", "").lower() in {"1", "true", "yes"}:
        res = LLMResponse(text="ok", provider="mock", model="mock-1")
    else:
        router = LLMRouter()
        res = await router.generate(prompt)
    provider = getattr(res, 'provider', '') if res else ''
    model = getattr(res, 'model', '') if res else ''
    text = res.text if res else ''
    print({
        'provider': provider,
        'model': model,
        'text': text,
        'text_len': len(text),
        'env': {
            'OPENAI_API_KEY': bool(os.getenv('OPENAI_API_KEY')),
            'GOOGLE_API_KEY': bool(os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')),
            'GROQ_API_KEY': bool(os.getenv('GROQ_API_KEY')),
            'LLM_PROVIDER': os.getenv('LLM_PROVIDER', ''),
        }
    })

if __name__ == '__main__':
    asyncio.run(main())
