"""Google Gemini chat model construction and failover routing.

The chat model tries the Gemini generation models in a fixed order and moves
to the next one only when the current one cannot answer right now: it is out
of quota, unavailable, or too slow. See ``failover_reason`` for the exact rule
and ``GeminiFailoverChatModel`` for how streaming is handled. The same rules
live in ``web/lib/ai/model.ts``; keep the two in step.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Iterator
from typing import Any, Literal
from urllib.parse import urlsplit

import httpx
import openai
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatGenerationChunk, ChatResult
from langchain_openai import ChatOpenAI
from pydantic import PrivateAttr

GEMINI_GENERATION_MODELS = (
    "gemini-4-hydrogen",
    "gemini-3.8-flash",
    "gemini-3.6-flash",
)
# Gemini 4 and 3.6+ run at fixed sampling settings: they ignore temperature /
# top_p / top_k today and Google has said a later release will reject them.
_GEMINI_MODELS_WITHOUT_SAMPLING = frozenset(GEMINI_GENERATION_MODELS)
# Former defaults. Environments still carry them from when the example env
# files spelled the default out (RAG_CHAT_MODEL=gemini-2.5-flash), so such a
# value means "nobody chose a model" and must not pin the service to it.
_SUPERSEDED_GEMINI_MODELS = frozenset({"gemini-2.5-flash"})
_SAMPLING_PARAMETERS = frozenset({"temperature", "top_p", "top_k"})

# How long one model gets to answer (or, when streaming, to start producing
# text), and how long a call may spend across all models before it gives up.
DEFAULT_ATTEMPT_TIMEOUT_SEC = 30.0
DEFAULT_TOTAL_TIMEOUT_SEC = 75.0
# No model is started with less than this share of an attempt's time left.
_MIN_ATTEMPT_FRACTION = 0.1

FailoverReason = Literal["quota", "unavailable", "timeout"]
_REASON_TEXT = {
    "quota": "hit a quota or rate limit",
    "unavailable": "is unavailable",
    "timeout": "timed out",
}


class AttemptTimeoutError(TimeoutError):
    """A model did not answer within the time one attempt is given."""

    def __init__(self, model: str, timeout: float):
        super().__init__(f"{model} did not answer within {timeout:.1f}s")
        self.model = model
        self.timeout = timeout


def is_google_generative_endpoint(base_url: str) -> bool:
    """Return whether the endpoint is Google's OpenAI-compatible Gemini API."""
    try:
        hostname = (urlsplit(base_url).hostname or "").lower()
    except ValueError:
        return False
    return hostname == "generativelanguage.googleapis.com"


def _bare_model_name(model: str) -> str:
    return model.strip().lower().removeprefix("models/")


def is_superseded_model(model: str | None) -> bool:
    """Return whether a model setting should be treated as not set at all."""
    return _bare_model_name(model or "") in _SUPERSEDED_GEMINI_MODELS


def resolve_model_chain(model: str | None, base_url: str) -> list[str]:
    """Return the models to try, in order, for one configured model name.

    On Google's endpoint: nothing configured, or a superseded default, gives
    the standard order; any other model goes first, followed by the rest of
    the standard order. Another provider gets the configured model alone.
    """
    name = (model or "").strip()
    if not is_google_generative_endpoint(base_url):
        return [name or GEMINI_GENERATION_MODELS[0]]
    bare = _bare_model_name(name)
    if not bare or bare in _SUPERSEDED_GEMINI_MODELS:
        return list(GEMINI_GENERATION_MODELS)
    first = bare if bare in GEMINI_GENERATION_MODELS else name
    return list(dict.fromkeys((first, *GEMINI_GENERATION_MODELS)))


def primary_model_name(model: str | None, base_url: str) -> str:
    """The model tried first for a configured name (for labels and reports)."""
    return resolve_model_chain(model, base_url)[0]


def _status_code(exc: BaseException) -> int | None:
    status_code = getattr(exc, "status_code", None)
    if status_code is None:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
    return status_code if isinstance(status_code, int) else None


def _error_text(exc: BaseException) -> str:
    details = [str(exc)]
    for attr in ("code", "body", "message"):
        value = getattr(exc, attr, None)
        if value is not None:
            if isinstance(value, (dict, list, tuple)):
                details.append(json.dumps(value, default=str))
            else:
                details.append(str(value))
    return " ".join(details)


def failover_reason(exc: BaseException) -> FailoverReason | None:
    """Why a failed attempt should be followed by the next model, or ``None``.

    - ``quota``: HTTP 429, or Google's ``RESOURCE_EXHAUSTED``.
    - ``unavailable``: HTTP 503, or Google's ``UNAVAILABLE`` (model overloaded).
    - ``timeout``: the attempt ran out of time — our own per-attempt limit, the
      SDK's request timeout, or HTTP 504 / ``DEADLINE_EXCEEDED`` from Google.

    Everything else is final and is raised as it is: invalid requests (400),
    authentication and permission errors (401 / 403), other server errors and
    network failures. Cancellation (``KeyboardInterrupt``, ``CancelledError``,
    a closed generator) is not an ``Exception`` and is never caught at all.

    When the error carries an HTTP status, the status alone decides. The
    status names are only looked for (as whole, upper-case words) when there
    is none, so a message that merely says "unavailable" is not mistaken.
    """
    status_code = _status_code(exc)
    if status_code is not None:
        if status_code == 429:
            return "quota"
        if status_code == 503:
            return "unavailable"
        if status_code == 504:
            return "timeout"
        return None

    if isinstance(exc, (openai.APITimeoutError, httpx.TimeoutException, TimeoutError)):
        return "timeout"

    text = _error_text(exc)
    if re.search(r"\bRESOURCE_EXHAUSTED\b", text):
        return "quota"
    if re.search(r"\bUNAVAILABLE\b", text):
        return "unavailable"
    if re.search(r"\bDEADLINE_EXCEEDED\b", text):
        return "timeout"
    return None


def is_quota_error(exc: BaseException) -> bool:
    """Recognize only HTTP 429 and Google's RESOURCE_EXHAUSTED error code."""
    return failover_reason(exc) == "quota"


def _without_unsupported_sampling(model: str, kwargs: dict[str, Any]) -> dict[str, Any]:
    if model.lower().removeprefix("models/") not in _GEMINI_MODELS_WITHOUT_SAMPLING:
        return kwargs
    return {
        key: value for key, value in kwargs.items() if key not in _SAMPLING_PARAMETERS
    }


def _has_visible_output(chunk: ChatGenerationChunk) -> bool:
    """True once a chunk carries text the user would see (or a tool call)."""
    message = chunk.message
    return bool(message.content) or bool(getattr(message, "tool_call_chunks", None))


class GeminiFailoverChatModel(BaseChatModel):
    """Try the configured Gemini models in order.

    The next model is tried when the current one is out of quota, is
    unavailable, or does not answer within ``attempt_timeout`` seconds
    (``failover_reason``); any other error is raised as it is. No attempt is
    started once ``total_timeout`` seconds have passed, and each attempt gets
    at most what is left of it, so the whole call is bounded.

    Streaming may move to the next model only before the current one has
    produced visible text. Chunks without text (such as an opening role-only
    chunk) do not count: they are held back and released with the first text,
    so nothing from an abandoned model reaches the caller. Once text has been
    yielded, any later failure is raised rather than joining two models'
    responses.
    """

    models: list[Any]
    model_names: list[str]
    attempt_timeout: float = DEFAULT_ATTEMPT_TIMEOUT_SEC
    total_timeout: float = DEFAULT_TOTAL_TIMEOUT_SEC
    _last_model_used: str | None = PrivateAttr(default=None)

    @property
    def last_model_used(self) -> str | None:
        """The model that handled the most recent successful request, if any."""
        return self._last_model_used

    @property
    def _llm_type(self) -> str:
        return "google-gemini-failover"

    @property
    def _identifying_params(self) -> dict[str, Any]:
        return {"models": self.model_names}

    def _next_attempt_timeout(
        self, started: float, is_last_model: bool = False
    ) -> float | None:
        """Seconds the next attempt may take, or None when no time is left.

        The per-attempt limit exists to move on to the next model. The last
        model has no next one, so it gets everything left of the total:
        cutting it off at the attempt limit would only turn a slow answer into
        a certain failure.
        """
        remaining = self.total_timeout - (time.monotonic() - started)
        # A sliver of time is not an attempt: starting a model that is certain
        # to be cut off only adds a pointless request.
        if remaining < self.attempt_timeout * _MIN_ATTEMPT_FRACTION:
            return None
        return remaining if is_last_model else min(self.attempt_timeout, remaining)

    def _should_try_next(self, exc: Exception, index: int, started: float) -> bool:
        """Decide whether to go on after a failed attempt; log it if so."""
        reason = failover_reason(exc)
        if reason is None or index == len(self.models) - 1:
            return False
        # No time left for another model: report what stopped this one.
        if self._next_attempt_timeout(started) is None:
            return False
        print(
            f"[LLM] {self.model_names[index]} {_REASON_TEXT[reason]}; "
            f"trying {self.model_names[index + 1]}"
        )
        return True

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        del run_manager  # The outer model emits callbacks for the returned result.
        started = time.monotonic()
        last = len(self.models) - 1
        for index, (model, model_name) in enumerate(zip(self.models, self.model_names)):
            timeout = self._next_attempt_timeout(started, index == last)
            if timeout is None:  # Only possible when total_timeout is not positive.
                raise AttemptTimeoutError(model_name, 0.0)
            try:
                result = model._generate(
                    messages,
                    stop=stop,
                    **{
                        **_without_unsupported_sampling(model_name, kwargs),
                        "timeout": timeout,
                    },
                )
                self._last_model_used = model_name
                return result
            except Exception as exc:  # noqa: BLE001
                if not self._should_try_next(exc, index, started):
                    raise
        raise RuntimeError("Gemini failover exhausted without a model response")

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        del run_manager  # Avoid double-emitting callbacks from nested chat models.
        started = time.monotonic()
        last = len(self.models) - 1
        for index, (model, model_name) in enumerate(zip(self.models, self.model_names)):
            timeout = self._next_attempt_timeout(started, index == last)
            if timeout is None:  # Only possible when total_timeout is not positive.
                raise AttemptTimeoutError(model_name, 0.0)
            attempt_started = time.monotonic()
            text_started = False
            held: list[ChatGenerationChunk] = []
            stream = model._stream(
                messages,
                stop=stop,
                **{
                    **_without_unsupported_sampling(model_name, kwargs),
                    "timeout": timeout,
                },
            )
            try:
                for chunk in stream:
                    if not text_started:
                        if not _has_visible_output(chunk):
                            # Still nothing to show: empty chunks must not keep
                            # a model alive past its time.
                            if time.monotonic() - attempt_started > timeout:
                                raise AttemptTimeoutError(model_name, timeout)
                            held.append(chunk)
                            continue
                        # First visible text: this model now owns the reply.
                        text_started = True
                        self._last_model_used = model_name
                        yield from held
                    yield chunk
                if not text_started:
                    # A reply with no text at all: pass on what it did contain.
                    yield from held
                self._last_model_used = model_name
                return
            except Exception as exc:  # noqa: BLE001
                if text_started or not self._should_try_next(exc, index, started):
                    raise
            finally:
                # Close the request if it was abandoned or the caller stopped reading.
                close = getattr(stream, "close", None)
                if close is not None:
                    close()
        raise RuntimeError("Gemini failover exhausted without a model response")


def build_chat_model(
    *,
    model: str,
    api_key: str,
    base_url: str,
    attempt_timeout: float = DEFAULT_ATTEMPT_TIMEOUT_SEC,
    total_timeout: float = DEFAULT_TOTAL_TIMEOUT_SEC,
    **model_kwargs: Any,
) -> BaseChatModel:
    """Build a chat model, enabling failover only for Google's endpoint."""
    if not is_google_generative_endpoint(base_url):
        return ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url=base_url,
            **model_kwargs,
        )

    model_names = resolve_model_chain(model, base_url)
    if is_superseded_model(model):
        print(
            f"[LLM] Configured model {model!r} is a retired default and is ignored; "
            f"using {model_names[0]}. Remove the setting, or set a current model."
        )
    providers = []
    for model_name in model_names:
        provider_kwargs = _without_unsupported_sampling(model_name, model_kwargs)
        # Failover handles a model that cannot answer; the SDK retrying the
        # same model first would only delay the move to the next one. Each
        # request is also given its own time limit by the failover model.
        provider_kwargs = {
            **provider_kwargs,
            "max_retries": 0,
            "timeout": attempt_timeout,
        }
        providers.append(
            ChatOpenAI(
                model=model_name,
                api_key=api_key,
                base_url=base_url,
                **provider_kwargs,
            )
        )
    return GeminiFailoverChatModel(
        models=providers,
        model_names=model_names,
        attempt_timeout=attempt_timeout,
        total_timeout=total_timeout,
    )
