"""GET /v1/health and GET /api/health — locked contract: 200 + {'status': 'healthy'}."""


def test_v1_health(client):
    r = client.get("/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "healthy"}


def test_legacy_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "healthy"}


def test_readiness(client):
    r = client.get("/v1/health/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready"
    assert "vector_backend" in body
