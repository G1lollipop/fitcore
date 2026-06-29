"""Contract tests for the SSE endpoint POST /v1/chat/stream."""

import json


def _parse_events(text: str) -> list[dict]:
    """Extract decoded JSON payloads from an SSE response body."""
    return [
        json.loads(line[len("data: ") :])
        for line in text.splitlines()
        if line.startswith("data: ")
    ]


def test_chat_stream_event_order(client):
    r = client.post("/v1/chat/stream", json={"query": "hi", "sessionId": "s1"})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/event-stream")

    events = _parse_events(r.text)
    types = [e["type"] for e in events]

    # sources first, at least one token, done last.
    assert types[0] == "sources"
    assert "token" in types
    assert types[-1] == "done"


def test_chat_stream_sources_payload(client):
    r = client.post("/v1/chat/stream", json={"query": "hypertrophy?", "sessionId": "s2"})
    assert r.status_code == 200, r.text

    events = _parse_events(r.text)
    sources = events[0]
    assert sources["type"] == "sources"
    assert {"citations", "retrievalMeta", "retrievalBackend"} <= sources.keys()
    assert sources["retrievalBackend"] in ("chroma", "supabase")
    assert isinstance(sources["citations"], list) and sources["citations"]

    citation = sources["citations"][0]
    assert {"id", "title", "source", "snippet", "score"} <= citation.keys()
    assert "retrievedCount" in sources["retrievalMeta"]


def test_chat_stream_tokens_concatenate_to_answer(client):
    r = client.post("/v1/chat/stream", json={"query": "x", "sessionId": "s3"})
    assert r.status_code == 200, r.text

    events = _parse_events(r.text)
    answer = "".join(e["content"] for e in events if e["type"] == "token")
    assert answer.strip()


def test_chat_stream_empty_query_returns_422(client):
    r = client.post("/v1/chat/stream", json={"query": "   ", "sessionId": "s1"})
    assert r.status_code == 422
    assert "query is required" in r.text


def test_chat_stream_forwards_topk_and_context(client, stub_rag):
    ctx = {"profile": {"goal": "muscle"}}
    r = client.post(
        "/v1/chat/stream",
        json={"query": "compare X and Y", "topK": 7, "userContext": ctx},
    )
    assert r.status_code == 200, r.text
    last = stub_rag.chat_calls[-1]
    assert last["top_k"] == 7
    assert last["user_context"] == ctx
    assert last["stream"] is True
