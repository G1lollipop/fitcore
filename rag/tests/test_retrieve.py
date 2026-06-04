"""Contract tests for POST /v1/retrieve."""


def test_retrieve_response_shape(client):
    r = client.post(
        "/v1/retrieve",
        json={"query": "q", "sessionId": "s", "userContext": {}, "topK": 3},
    )
    assert r.status_code == 200, r.text
    data = r.json()

    assert "chunks" in data
    assert isinstance(data["chunks"], list)
    assert len(data["chunks"]) == 3

    chunk = data["chunks"][0]
    # Locked field set
    assert {"id", "title", "source", "snippet", "score"} <= chunk.keys()
    assert isinstance(chunk["title"], str)
    assert isinstance(chunk["source"], str)
    assert isinstance(chunk["snippet"], str)


def test_retrieve_topk_default_is_5(client, stub_rag):
    """Locked default: topK=5 when client omits the field (matches RetrieveRequest)."""
    r = client.post("/v1/retrieve", json={"query": "q"})
    assert r.status_code == 200
    assert stub_rag.retrieve_calls[-1]["k"] == 5


def test_retrieve_topk_explicit_in_range(client, stub_rag):
    """1 <= topK <= 20 honors the client's request verbatim."""
    client.post("/v1/retrieve", json={"query": "q", "topK": 8})
    assert stub_rag.retrieve_calls[-1]["k"] == 8


def test_retrieve_topk_zero_falls_back_to_adaptive(client, stub_rag):
    """topK=0 fails the 1<=topK<=20 guard, so adaptive_k decides from query content.
    'compare X and Y plan' hits two complex signals (compare, plan) → k=8."""
    client.post(
        "/v1/retrieve",
        json={"query": "compare X and Y plan", "topK": 0},
    )
    assert stub_rag.retrieve_calls[-1]["k"] == 8


def test_retrieve_topk_above_range_falls_back_to_adaptive(client, stub_rag):
    """topK=99 fails the upper bound; adaptive picks based on query — short generic
    query falls into the medium tier (k=5)."""
    client.post("/v1/retrieve", json={"query": "蛋白质", "topK": 99})
    assert stub_rag.retrieve_calls[-1]["k"] == 5
