"""Server-only CREAO API Trigger adapter. See docs/josh-creao.md for setup."""
import json
import os
from uuid import UUID

import httpx

from .. import config
from ..adaptation import clean_settings

FAILED = {"status": "failed", "proposal": None, "explanation_md": None}


def _settings():
    key = os.environ.get("CREAO_API_KEY", "").strip()
    agent = str(UUID(os.environ.get("CREAO_AGENT_ID", "").strip()))
    if key.startswith("capi_"):
        return key, "https://agent.creao.ai", f"/api/v1/apps/{agent}/runs", False
    if key.startswith("cr_sk_"):
        return key, "https://developer.creao.ai", "/v1/runs", True
    raise ValueError("CREAO credentials are not configured")


def configuration_status():
    try:
        _settings()
        ready = config.ENABLE_CREAO
    except ValueError:
        ready = False
    return {"ready": ready}


def _request(method, path, payload=None):
    key, origin, _, _ = _settings()
    # Fixed official origins and no redirects: credentials stay on the server.
    with httpx.Client(base_url=origin, headers={"Authorization": f"Bearer {key}"},
                      timeout=20, follow_redirects=False) as client:
        response = client.request(method, path, json=payload)
        response.raise_for_status()
        value = response.json()
    if not isinstance(value, dict):
        raise ValueError("Unexpected CREAO response")
    return value


def start_adaptation(*, patient: dict, config: dict, sessions: list, feedback: list) -> str:
    _, _, path, account_key = _settings()
    # The agent has one text input named session_data. It receives no images or raw hand vectors.
    inputs = {"session_data": json.dumps({"patient": patient, "config": config,
              "sessions": sessions, "feedback": feedback}, allow_nan=False)}
    payload = {"agent_id": os.environ["CREAO_AGENT_ID"].strip(), "input": inputs} if account_key else {"inputs": inputs}
    result = _request("POST", path, payload)
    return str(UUID(result.get("run_id") if account_key else result.get("id")))


def get_adaptation(job_id: str) -> dict:
    try:
        _, _, path, _ = _settings()
        run = _request("GET", f"{path}/{UUID(job_id)}")
        status = run.get("status")
        if status in ("pending", "queued", "running"):
            return {"status": "pending", "proposal": None, "explanation_md": None}
        if status != "completed":
            return dict(FAILED)
        result = run.get("result")
        # CREAO can put a saved summary in text and the full reply in chatText.
        # Accept either documented field only after the same strict validation.
        candidates = [result.get("text"), result.get("chatText")] if isinstance(result, dict) and (
            "text" in result or "chatText" in result) else [result]
        for candidate in candidates:
            try:
                if isinstance(candidate, str):
                    text = candidate.strip()
                    if text.startswith("```json\n") and text.endswith("```"):
                        text = text[8:-3].strip()
                    candidate = json.loads(text)
                if not isinstance(candidate, dict):
                    continue
                proposal = clean_settings(candidate.get("proposal", candidate))
                explanation = candidate.get("explanation_md")
                if not isinstance(explanation, str) or not explanation.strip():
                    continue
                # Some JSON replies double-escape line breaks. Keep display plain text.
                return {"status": "done", "proposal": proposal,
                        "explanation_md": explanation.replace("\\n", "\n")[:12000]}
            except (ValueError, TypeError, KeyError):
                continue
        return dict(FAILED)
    except (ValueError, TypeError, KeyError, httpx.HTTPError):
        return dict(FAILED)
