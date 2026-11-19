"""Gemini model order and failover rules for the RAG chat model."""

from __future__ import annotations

import json
import time
from typing import Any

import httpx
import openai
import pytest
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from langchain_openai import ChatOpenAI

from app.infra.llm_routing import (
    GEMINI_GENERATION_MODELS,
    AttemptTimeoutError,
    GeminiFailoverChatModel,
    build_chat_model,
    failover_reason,
    is_quota_error,
    primary_model_name,
    resolve_model_chain,
)

GOOGLE = "https://generativelanguage.googleapis.com/v1beta/openai/"
OTHER = "https://llm.example.com/v1"
HYDROGEN, FLASH_38, FLASH_36 = GEMINI_GENERATION_MODELS


class ApiError(Exception):
    """Shaped like the OpenAI SDK's errors: a status code and a parsed body."""

    def __init__(self, status_code: int | None, message: str, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def rate_limited() -> ApiError:
    return ApiError(429, "Error code: 429 - rate limit")


def resource_exhausted() -> ApiError:
    return ApiError(None, "quota", {"error": {"status": "RESOURCE_EXHAUSTED"}})


def overloaded() -> ApiError:
    return ApiError(
        503, "Error code: 503 - high demand", {"error": {"status": "UNAVAILABLE"}}
    )


def timed_out() -> Exception:
    return openai.APITimeoutError(request=httpx.Request("POST", GOOGLE))


def bad_request() -> ApiError:
    return ApiError(400, "Error code: 400 - invalid argument")


def unauthorized() -> ApiError:
    return ApiError(401, "Error code: 401 - API key not valid")


def forbidden() -> ApiError:
    return ApiError(403, "Error code: 403 - permission denied")


# A streamed chunk with no text, like the opening role-only chunk.
EMPTY = ""


class FakeModel:
    """A provider that replays a script: text pieces, or an error at that point.

    A float in the script is a pause of that many seconds (a slow model).
    """

    def __init__(self, name: str, script: list[Any], log: list[tuple[str, dict]]):
        self.name, self.script, self.log = name, script, log
        self.closed = False

    def _generate(self, messages, stop=None, **kwargs):
        self.log.append((self.name, kwargs))
        for step in self.script:
            if isinstance(step, BaseException):
                raise step
            if isinstance(step, float):
                time.sleep(step)
        text = "".join(step for step in self.script if isinstance(step, str))
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=text))])

    def _stream(self, messages, stop=None, **kwargs):
        self.log.append((self.name, kwargs))
        try:
            for step in self.script:
                if isinstance(step, BaseException):
                    raise step
                if isinstance(step, float):
                    time.sleep(step)
                    continue
                yield ChatGenerationChunk(message=AIMessageChunk(content=step))
        finally:
            self.closed = True


def failover_model(scripts: dict[str, list[Any]], **limits: float):
    log: list[tuple[str, dict]] = []
    names = list(scripts)
    providers = [FakeModel(name, scripts[name], log) for name in names]
    model = GeminiFailoverChatModel(models=providers, model_names=names, **limits)
    return model, log


def tried(log) -> list[str]:
    return [name for name, _ in log]


# ── The order ────────────────────────────────────────────────────────────────


def test_standard_order():
    assert GEMINI_GENERATION_MODELS == (
        "gemini-4-hydrogen",
        "gemini-3.8-flash",
        "gemini-3.6-flash",
    )
    assert resolve_model_chain(None, GOOGLE) == [HYDROGEN, FLASH_38, FLASH_36]
    assert resolve_model_chain("  ", GOOGLE) == [HYDROGEN, FLASH_38, FLASH_36]


@pytest.mark.parametrize(
    "leftover", ["gemini-2.5-flash", "models/gemini-2.5-flash", " Gemini-2.5-Flash "]
)
def test_leftover_default_does_not_override_the_new_one(leftover):
    assert resolve_model_chain(leftover, GOOGLE) == [HYDROGEN, FLASH_38, FLASH_36]
    assert primary_model_name(leftover, GOOGLE) == HYDROGEN


def test_explicit_model_goes_first_then_the_rest_of_the_order():
    assert resolve_model_chain("gemini-3.8-flash", GOOGLE) == [
        FLASH_38,
        HYDROGEN,
        FLASH_36,
    ]
    assert resolve_model_chain("gemini-4-argon", GOOGLE) == [
        "gemini-4-argon",
        HYDROGEN,
        FLASH_38,
        FLASH_36,
    ]
    assert resolve_model_chain("gemini-4-hydrogen", GOOGLE) == [
        HYDROGEN,
        FLASH_38,
        FLASH_36,
    ]


def test_other_provider_uses_the_configured_model_alone():
    assert resolve_model_chain("some-model", OTHER) == ["some-model"]
    # Not Google's endpoint: the name is that provider's business.
    assert resolve_model_chain("gemini-2.5-flash", OTHER) == ["gemini-2.5-flash"]

    model = build_chat_model(
        model="some-model", api_key="k", base_url=OTHER, temperature=0
    )
    assert isinstance(model, ChatOpenAI)
    assert model.model_name == "some-model"
    assert model.temperature == 0


def test_build_chat_model_on_google_wraps_the_order(capsys):
    model = build_chat_model(
        model="gemini-2.5-flash", api_key="k", base_url=GOOGLE, temperature=0
    )
    assert isinstance(model, GeminiFailoverChatModel)
    assert model.model_names == [HYDROGEN, FLASH_38, FLASH_36]
    assert [provider.model_name for provider in model.models] == model.model_names
    # The ignored setting is called out in the service log.
    assert "gemini-2.5-flash" in capsys.readouterr().out
    # Sampling settings are not sent to models that no longer take them.
    assert all(provider.temperature is None for provider in model.models)
    # The SDK must not retry a failing model before the next one is tried.
    assert all(provider.max_retries == 0 for provider in model.models)
    assert all(
        provider.request_timeout == model.attempt_timeout for provider in model.models
    )
    assert 0 < model.attempt_timeout < model.total_timeout


def test_default_settings_use_the_new_default(monkeypatch):
    from app.core.settings import Settings

    monkeypatch.delenv("RAG_CHAT_MODEL", raising=False)
    assert Settings(_env_file=None).rag_chat_model == HYDROGEN
    # Embeddings are not part of this change.
    assert Settings(_env_file=None).embedding_model == "models/gemini-embedding-001"
    assert Settings(_env_file=None).embedding_dim == 768


# ── When to move to the next model ───────────────────────────────────────────


def test_failover_reasons():
    assert failover_reason(rate_limited()) == "quota"
    assert failover_reason(resource_exhausted()) == "quota"
    assert failover_reason(Exception("status: RESOURCE_EXHAUSTED")) == "quota"

    assert failover_reason(overloaded()) == "unavailable"
    assert (
        failover_reason(Exception('{"error": {"status": "UNAVAILABLE"}}'))
        == "unavailable"
    )

    assert failover_reason(timed_out()) == "timeout"
    assert failover_reason(httpx.ReadTimeout("slow")) == "timeout"
    assert failover_reason(AttemptTimeoutError(HYDROGEN, 30.0)) == "timeout"
    assert (
        failover_reason(ApiError(504, "Error code: 504 - deadline exceeded"))
        == "timeout"
    )
    assert failover_reason(Exception("status: DEADLINE_EXCEEDED")) == "timeout"

    assert is_quota_error(rate_limited())
    assert not is_quota_error(overloaded())


def test_everything_else_is_final():
    for exc in (
        bad_request(),
        unauthorized(),
        forbidden(),
        ApiError(404, "model not found"),
    ):
        assert failover_reason(exc) is None
    assert failover_reason(ApiError(500, "Error code: 500 - internal")) is None
    assert (
        failover_reason(
            openai.APIConnectionError(request=httpx.Request("POST", GOOGLE))
        )
        is None
    )
    # The status decides when there is one, whatever the message says.
    assert (
        failover_reason(ApiError(400, "UNAVAILABLE in your region: RESOURCE_EXHAUSTED"))
        is None
    )
    # Only the status names count, not ordinary words or digits.
    assert (
        failover_reason(Exception("the knowledge base is temporarily unavailable"))
        is None
    )
    assert failover_reason(Exception("max_tokens must be below 4290 or 5030")) is None


# ── Complete replies ─────────────────────────────────────────────────────────


def test_first_model_answers_when_available():
    model, log = failover_model({HYDROGEN: ["hello"], FLASH_38: ["unused"]})
    assert model.invoke("hi").content == "hello"
    assert tried(log) == [HYDROGEN]
    assert model.last_model_used == HYDROGEN


@pytest.mark.parametrize(
    "flash_38_failure", [overloaded, timed_out], ids=["503", "timeout"]
)
def test_reaches_3_6_when_hydrogen_returns_429_and_3_8_is_unavailable_or_times_out(
    flash_38_failure,
):
    model, log = failover_model(
        {
            HYDROGEN: [rate_limited()],
            FLASH_38: [flash_38_failure()],
            FLASH_36: ["from 3.6"],
        }
    )
    assert model.invoke("hi").content == "from 3.6"
    assert tried(log) == [HYDROGEN, FLASH_38, FLASH_36]
    assert model.last_model_used == FLASH_36


@pytest.mark.parametrize("failure", [bad_request, unauthorized, forbidden])
def test_stops_on_invalid_requests_and_auth_errors(failure):
    model, log = failover_model({HYDROGEN: [failure()], FLASH_38: ["unused"]})
    with pytest.raises(ApiError) as caught:
        model.invoke("hi")
    assert caught.value.status_code in (400, 401, 403)
    assert tried(log) == [HYDROGEN]

    # Nor part-way down the order.
    model, log = failover_model(
        {HYDROGEN: [rate_limited()], FLASH_38: [failure()], FLASH_36: ["unused"]}
    )
    with pytest.raises(ApiError):
        model.invoke("hi")
    assert tried(log) == [HYDROGEN, FLASH_38]


def test_stops_on_cancellation():
    model, log = failover_model({HYDROGEN: [KeyboardInterrupt()], FLASH_38: ["unused"]})
    with pytest.raises(KeyboardInterrupt):
        model._generate([])
    assert tried(log) == [HYDROGEN]


def test_raises_the_last_error_when_every_model_fails_over():
    model, log = failover_model(
        {
            HYDROGEN: [rate_limited()],
            FLASH_38: [overloaded()],
            FLASH_36: [rate_limited()],
        }
    )
    with pytest.raises(ApiError) as caught:
        model.invoke("hi")
    assert caught.value.status_code == 429
    assert tried(log) == [HYDROGEN, FLASH_38, FLASH_36]


def test_each_attempt_gets_a_time_limit_within_the_total():
    model, log = failover_model(
        {HYDROGEN: [0.05, rate_limited()], FLASH_38: ["ok"]},
        attempt_timeout=0.2,
        total_timeout=0.2,
    )
    assert model.invoke("hi").content == "ok"
    first, second = (kwargs["timeout"] for _, kwargs in log)
    assert first == pytest.approx(0.2, abs=0.02)
    # The second attempt only gets what is left of the total.
    assert 0 < second <= 0.16


def test_the_last_model_gets_the_rest_of_the_total_time():
    # Seen live: Hydrogen out of quota, 3.8 overloaded, and 3.6 answering only
    # after the attempt limit. Nothing comes after the last model, so cutting
    # it off at the attempt limit could only fail the call.
    model, log = failover_model(
        {HYDROGEN: [rate_limited()], FLASH_38: [overloaded()], FLASH_36: ["ok"]},
        attempt_timeout=0.1,
        total_timeout=1.0,
    )
    assert model.invoke("hi").content == "ok"
    *earlier, (_, last) = log
    assert all(kwargs["timeout"] == pytest.approx(0.1) for _, kwargs in earlier)
    assert last["timeout"] > 0.5


def test_no_attempt_starts_once_the_total_time_is_used_up():
    model, log = failover_model(
        {
            HYDROGEN: [0.08, timed_out()],
            FLASH_38: [0.08, timed_out()],
            FLASH_36: ["unused"],
        },
        attempt_timeout=0.1,
        total_timeout=0.12,
    )
    started = time.monotonic()
    with pytest.raises(openai.APITimeoutError):
        model.invoke("hi")
    assert tried(log) == [HYDROGEN, FLASH_38]
    assert time.monotonic() - started < 1.0


def test_sampling_parameters_are_dropped_only_for_models_without_them():
    model, log = failover_model({"custom-model": [rate_limited()], HYDROGEN: ["ok"]})
    model.invoke("hi", temperature=0, top_p=0.9, max_tokens=50)
    custom, hydrogen = (kwargs for _, kwargs in log)
    assert {key: custom[key] for key in ("temperature", "top_p", "max_tokens")} == {
        "temperature": 0,
        "top_p": 0.9,
        "max_tokens": 50,
    }
    assert hydrogen["max_tokens"] == 50
    assert "temperature" not in hydrogen and "top_p" not in hydrogen


# ── Streaming ────────────────────────────────────────────────────────────────


def stream_chunks(model) -> tuple[list[str], BaseException | None]:
    pieces: list[str] = []
    error = None
    try:
        for chunk in model.stream("hi"):
            pieces.append(chunk.content)
    except Exception as exc:  # noqa: BLE001
        error = exc
    return pieces, error


@pytest.mark.parametrize(
    "flash_38_script",
    [[overloaded()], [EMPTY, overloaded()], [timed_out()], [EMPTY, timed_out()]],
    ids=["503", "empty chunk then 503", "timeout", "empty chunk then timeout"],
)
def test_stream_reaches_3_6_when_hydrogen_returns_429_and_3_8_fails_before_text(
    flash_38_script,
):
    model, log = failover_model(
        {
            HYDROGEN: [rate_limited()],
            FLASH_38: flash_38_script,
            FLASH_36: [EMPTY, "From ", "3.6"],
        }
    )
    pieces, error = stream_chunks(model)
    assert error is None
    assert "".join(pieces) == "From 3.6"
    # Nothing from the abandoned model reaches the caller, not even its empty chunk.
    assert [piece for piece in pieces if piece] == ["From ", "3.6"]
    assert (
        pieces.count(EMPTY) <= 2
    )  # 3.6's own empty chunk, plus LangChain's closing chunk
    assert tried(log) == [HYDROGEN, FLASH_38, FLASH_36]
    assert model.last_model_used == FLASH_36


def test_stream_switches_before_visible_text_even_after_empty_chunks():
    model, log = failover_model(
        {HYDROGEN: [EMPTY, EMPTY, resource_exhausted()], FLASH_38: ["Hi ", "there"]}
    )
    pieces, error = stream_chunks(model)
    assert error is None
    assert "".join(pieces) == "Hi there"
    assert tried(log) == [HYDROGEN, FLASH_38]
    # The abandoned request is closed, not left open.
    assert model.models[0].closed


def test_stream_gives_up_on_a_model_that_sends_only_empty_chunks_for_too_long():
    model, log = failover_model(
        {HYDROGEN: [EMPTY, 0.08, EMPTY, "too late"], FLASH_38: ["in time"]},
        attempt_timeout=0.05,
        total_timeout=5.0,
    )
    pieces, error = stream_chunks(model)
    assert error is None
    assert "".join(pieces) == "in time"
    assert tried(log) == [HYDROGEN, FLASH_38]


@pytest.mark.parametrize(
    "failure", [rate_limited, overloaded, timed_out], ids=["429", "503", "timeout"]
)
def test_stream_never_switches_after_text_has_started(failure):
    error_raised = failure()
    model, log = failover_model(
        {
            HYDROGEN: [EMPTY, "Your protein ", "target is", error_raised],
            FLASH_38: ["another"],
        }
    )
    pieces, error = stream_chunks(model)
    # What was produced stands; the failure is raised; no other model is asked.
    assert "".join(pieces) == "Your protein target is"
    assert error is error_raised
    assert tried(log) == [HYDROGEN]


@pytest.mark.parametrize("failure", [bad_request, unauthorized, forbidden])
def test_stream_stops_on_invalid_requests_and_auth_errors(failure):
    for script in ([failure()], [EMPTY, failure()]):
        model, log = failover_model({HYDROGEN: script, FLASH_38: ["unused"]})
        pieces, error = stream_chunks(model)
        assert "".join(pieces) == ""
        assert isinstance(error, ApiError) and error.status_code in (400, 401, 403)
        assert tried(log) == [HYDROGEN]


def test_stream_stops_when_the_caller_stops_reading():
    model, log = failover_model(
        {HYDROGEN: ["one", "two", "three"], FLASH_38: ["unused"]}
    )
    stream = model._stream([])
    assert next(stream).message.content == "one"
    stream.close()  # the user went away
    assert tried(log) == [HYDROGEN]
    assert model.models[0].closed


def test_stream_raises_when_every_model_fails_over():
    model, log = failover_model(
        {
            HYDROGEN: [rate_limited()],
            FLASH_38: [overloaded()],
            FLASH_36: [resource_exhausted()],
        }
    )
    pieces, error = stream_chunks(model)
    assert "".join(pieces) == ""
    assert is_quota_error(error)
    assert tried(log) == [HYDROGEN, FLASH_38, FLASH_36]


# ── Through the real OpenAI SDK, with only the network replaced ──────────────


def sdk_model(respond, **limits: float):
    """The model build_chat_model returns, talking to a fake network."""
    requests: list[tuple[str, dict]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        requests.append((body["model"], request.extensions.get("timeout", {})))
        return respond(body["model"])

    client = httpx.Client(transport=httpx.MockTransport(handler))
    model = build_chat_model(
        model="gemini-2.5-flash",
        api_key="k",
        base_url=GOOGLE,
        http_client=client,
        **limits,
    )
    return model, requests


def http_error(status: int, name: str) -> httpx.Response:
    return httpx.Response(
        status, json={"error": {"code": status, "status": name, "message": name}}
    )


def http_answer(model: str, text: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "cmpl-1",
            "object": "chat.completion",
            "created": 0,
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": text},
                }
            ],
        },
    )


@pytest.mark.parametrize("flash_38", ["503", "timeout"])
def test_real_sdk_reaches_3_6_when_hydrogen_returns_429_and_3_8_fails(flash_38, capsys):
    def respond(model: str) -> httpx.Response:
        if model == HYDROGEN:
            # A long retry-after: an SDK retry would stall the test.
            return httpx.Response(
                429,
                headers={"retry-after": "120"},
                json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}},
            )
        if model == FLASH_38:
            if flash_38 == "timeout":
                raise httpx.ReadTimeout("no answer in time")
            return http_error(503, "UNAVAILABLE")
        return http_answer(model, "from 3.6")

    model, requests = sdk_model(respond, attempt_timeout=7.0, total_timeout=20.0)
    started = time.monotonic()

    assert model.invoke("hi").content == "from 3.6"

    # One request per model: the SDK retried neither the 429 nor the 503 / timeout.
    assert [name for name, _ in requests] == [HYDROGEN, FLASH_38, FLASH_36]
    assert model.last_model_used == FLASH_36
    assert time.monotonic() - started < 5.0
    # Each request carried its own time limit down to the HTTP client: the
    # attempt limit, or what is left of the total for the last model.
    *earlier, (_, last) = requests
    assert all(0 < timeout["read"] <= 7.0 for _, timeout in earlier)
    assert 7.0 < last["read"] <= 20.0
    assert "trying gemini-3.6-flash" in capsys.readouterr().out


@pytest.mark.parametrize(
    "status,name",
    [(400, "INVALID_ARGUMENT"), (401, "UNAUTHENTICATED"), (403, "PERMISSION_DENIED")],
)
def test_real_sdk_stops_on_invalid_requests_and_auth_errors(status, name):
    model, requests = sdk_model(lambda _model: http_error(status, name))
    with pytest.raises(openai.APIStatusError) as caught:
        model.invoke("hi")
    assert caught.value.status_code == status
    assert [name for name, _ in requests] == [HYDROGEN]
