"""Contract tests for /v1/chat (structured) and /api/chat (legacy)."""


# ── /v1/chat response shape ───────────────────────────────────────────────


def test_v1_chat_response_shape(client):
    r = client.post(
        "/v1/chat",
        json={"query": "hi", "sessionId": "s1", "userContext": {}},
    )
    assert r.status_code == 200, r.text
    data = r.json()

    # Required top-level keys
    assert {"answer", "citations", "retrievalMeta", "retrievalBackend"} <= data.keys()

    assert isinstance(data["answer"], str) and data["answer"]
    assert isinstance(data["citations"], list) and data["citations"]

    citation = data["citations"][0]
    assert {"id", "title", "source", "snippet", "score"} <= citation.keys()

    assert "retrievedCount" in data["retrievalMeta"]
    assert isinstance(data["retrievalMeta"]["retrievedCount"], int)

    # The locked contract: backend identifier must be one of these strings.
    assert data["retrievalBackend"] in ("chroma", "supabase")


def test_v1_chat_accepts_message_alias(client):
    """ChatRequest must accept either 'query' or 'message' (legacy frontend)."""
    r = client.post("/v1/chat", json={"message": "hi", "sessionId": "s1"})
    assert r.status_code == 200, r.text


def test_v1_chat_session_id_defaults_to_anonymous(client, stub_rag):
    """sessionId is optional; legacy clients sometimes omit it."""
    r = client.post("/v1/chat", json={"query": "hi"})
    assert r.status_code == 200, r.text
    assert stub_rag.chat_calls[-1]["session_id"] == "anonymous"


def test_v1_chat_empty_query_returns_422(client):
    """Empty/whitespace query is a client error → 422 (validated up-front,
    not retried as a 500). See chat.py:_resolve_query."""
    r = client.post("/v1/chat", json={"query": "  ", "sessionId": "s1"})
    assert r.status_code == 422
    assert "query is required" in r.text


# ── /api/chat legacy adapter ──────────────────────────────────────────────


def test_legacy_api_chat_response_shape(client):
    r = client.post("/api/chat", json={"message": "hi", "sessionId": "s1"})
    assert r.status_code == 200, r.text
    data = r.json()

    # Locked: legacy must return ONLY {"response": "..."}
    assert set(data.keys()) == {"response"}
    assert isinstance(data["response"], str) and data["response"]


def test_legacy_chat_response_matches_v1_answer(client, stub_rag):
    """The legacy adapter must surface exactly v1.answer in {response}."""
    payload = {"query": "what is hypertrophy?", "sessionId": "s2"}
    v1 = client.post("/v1/chat", json=payload).json()
    legacy = client.post("/api/chat", json=payload).json()
    assert legacy["response"] == v1["answer"]


# ── topK dual mode on /v1/chat ────────────────────────────────────────────


def test_topk_explicit_passes_through(client, stub_rag):
    """Explicit 1<=topK<=20 must be forwarded to RagService.chat()."""
    client.post("/v1/chat", json={"query": "compare X and Y", "topK": 7})
    assert stub_rag.chat_calls[-1]["top_k"] == 7


def test_topk_omitted_means_adaptive(client, stub_rag):
    """When topK is omitted (None), service receives None and decides itself."""
    client.post("/v1/chat", json={"query": "compare X and Y"})
    assert stub_rag.chat_calls[-1]["top_k"] is None


def test_topk_user_context_round_trip(client, stub_rag):
    """userContext must be forwarded to the service unchanged."""
    ctx = {"profile": {"goal": "muscle"}, "today": {"calories": 2200}}
    client.post("/v1/chat", json={"query": "x", "userContext": ctx})
    assert stub_rag.chat_calls[-1]["user_context"] == ctx
