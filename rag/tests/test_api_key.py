"""RAG_API_KEY must guard every LLM/retrieval route, including the legacy adapter."""

import pytest

from app.core.settings import reset_settings_cache

PROTECTED_ROUTES = [
    ("/v1/chat", {"query": "hi", "sessionId": "s1", "userContext": {}}),
    ("/api/chat", {"message": "hi", "sessionId": "s1"}),
    ("/v1/chat/stream", {"query": "hi", "sessionId": "s1", "userContext": {}}),
    ("/v1/retrieve", {"query": "hi", "sessionId": "s1", "userContext": {}}),
]


@pytest.fixture
def api_key(monkeypatch):
    """Configure a shared key for the duration of one test."""
    monkeypatch.setenv("RAG_API_KEY", "s3cret")
    yield "s3cret"
    # Settings is cached; drop it so the key doesn't leak into later tests.
    monkeypatch.delenv("RAG_API_KEY")
    reset_settings_cache()


@pytest.mark.parametrize("path,payload", PROTECTED_ROUTES)
def test_rejects_missing_or_wrong_key(api_key, client, path, payload):
    assert client.post(path, json=payload).status_code == 401
    assert (
        client.post(path, json=payload, headers={"X-API-Key": "nope"}).status_code
        == 401
    )


@pytest.mark.parametrize("path,payload", PROTECTED_ROUTES)
def test_accepts_matching_key(api_key, client, path, payload):
    r = client.post(path, json=payload, headers={"X-API-Key": api_key})
    assert r.status_code == 200, r.text


def test_open_when_no_key_configured(monkeypatch, client):
    monkeypatch.delenv("RAG_API_KEY", raising=False)
    reset_settings_cache()
    r = client.post("/api/chat", json={"message": "hi", "sessionId": "s1"})
    assert r.status_code == 200, r.text
