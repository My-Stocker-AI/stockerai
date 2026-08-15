from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
from app.config import OPENAI_API_KEY
from app.services.auth import AuthCaller, Caller

router = APIRouter()


class OpenAIChatRequest(BaseModel):
    model: str = "gpt-4o-mini"
    messages: list
    tools: list | None = None
    tool_choice: str | None = "auto"


@router.post("/openai-chat")
async def openai_chat(req: OpenAIChatRequest, caller: Caller = AuthCaller):
    """
    The app's conversation with the AI passes through here so the OpenAI key never ships to a
    phone. That also made it a free, unmetered AI endpoint for anyone who found the address —
    billed to us. A login is now required to use it.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    payload = {
        "model": req.model,
        "messages": req.messages,
    }
    if req.tools:
        payload["tools"] = req.tools
        payload["tool_choice"] = req.tool_choice

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return resp.json()
