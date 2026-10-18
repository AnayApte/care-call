"""Gemini for free-text caregiver questions over iMessage, with the last 24 hours of requests as context."""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import sentry_sdk

from .. import config, store

log = logging.getLogger("carecall.gemini")

SYSTEM = (
    "You help a family caregiver keep track of Maria, a synthetic demo patient in an assistive prototype. "
    "Maria cannot speak, so she makes small trained movements that send requests (water, pain, help, bathroom). "
    "Answer only from the request log you are given, in plain text, in at most 3 short sentences, no markdown. "
    "Use relative times like '2 h ago'. If the log does not contain the answer, say so. "
    "You are not a medical device: never diagnose, interpret symptoms or give medical advice. "
    "Only when the question is about health, symptoms, medication or an emergency, add that they should "
    "contact the care team or call 911. Otherwise do not mention it."
)


def _ago(created_at: str, now: datetime) -> str:
    minutes = int((now - store.parse_iso(created_at)).total_seconds() // 60)
    return f"{minutes} min ago" if minutes < 90 else f"{minutes // 60} h ago"


def _context(now: datetime) -> str:
    rows = store.list_requests("p_demo", since=now - timedelta(hours=24))
    if not rows:
        return "No requests in the last 24 hours."
    lines = []
    for r in rows:
        if r["status"] == "open":
            lines.append(f"- {r['display']}, {_ago(r['created_at'], now)}, STILL OPEN")
        else:
            secs = round((r["ack_latency_ms"] or 0) / 1000)
            lines.append(f"- {r['display']}, {_ago(r['created_at'], now)}, answered by {r['acked_by']} after {secs} s")
    return "Requests in the last 24 hours, newest first:\n" + "\n".join(lines)


def _ask(model: str, prompt: str) -> Optional[str]:
    """One model. Returns the text, None for an empty answer; raises httpx.HTTPError on failure."""
    with sentry_sdk.start_span(op="gen_ai.chat", name=f"chat {model}") as span:
        span.set_data("gen_ai.system", "gemini")
        span.set_data("gen_ai.operation.name", "chat")
        span.set_data("gen_ai.request.model", model)
        r = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": config.GEMINI_API_KEY},
            json={"systemInstruction": {"parts": [{"text": SYSTEM}]},
                  "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                  "generationConfig": {"maxOutputTokens": 300, "temperature": 0.3,
                                       "thinkingConfig": {"thinkingBudget": 0}}},
            timeout=15)
        r.raise_for_status()
        data = r.json()
        usage = data.get("usageMetadata", {})
        span.set_data("gen_ai.usage.input_tokens", usage.get("promptTokenCount"))
        span.set_data("gen_ai.usage.output_tokens", usage.get("candidatesTokenCount"))
        text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"]).strip()
        return text or None


def answer(question: str) -> Optional[str]:
    """Gemini's reply, or None if Gemini is not set up or every model fails (the caller falls back to help text)."""
    if not config.GEMINI_API_KEY:
        return None
    prompt = f"{_context(datetime.now(timezone.utc))}\n\nCaregiver's question: {question.strip()[:500]}"
    for model in config.GEMINI_MODELS:
        try:
            return _ask(model, prompt)
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            log.warning("gemini %s failed, trying the next model: %s", model, exc)
    log.error("gemini: every model failed")
    return None
