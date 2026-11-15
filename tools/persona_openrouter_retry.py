"""Bounded OpenRouter retry helper. No retry for auth/billing/invalid payloads.
Place next to studio_providers.py. Does not initiate network access on import.
"""
from __future__ import annotations
import logging
import time
from collections.abc import Callable
from typing import TypeVar
from studio_providers import ProviderError
T = TypeVar("T")
LOG = logging.getLogger(__name__)
DELAYS_SECONDS = (2.0, 4.0, 8.0)
TRANSIENT_HTTP = frozenset({408, 429, 500, 502, 503, 504})
def is_transient_openrouter(error: Exception) -> bool:
    return (
        isinstance(error, ProviderError)
        and error.provider == "openrouter"
        and error.code not in {"missing_OPENROUTER_API_KEY", "invalid_response"}
        and (error.status in (0, *TRANSIENT_HTTP) or (error.status == 200 and error.code == "response_timeout"))
    )
def with_openrouter_retry(
    operation: Callable[[], T],
    *,
    sleep: Callable[[float], None] = time.sleep,
    delays: tuple[float, ...] = DELAYS_SECONDS,
    logger: logging.Logger = LOG,
) -> T:
    for attempt in range(len(delays) + 1):
        try:
            return operation()
        except Exception as error:
            if attempt == len(delays) or not is_transient_openrouter(error):
                raise
            retry_after = getattr(error, "retry_after", None)
            base = float(delays[attempt])
            try:
                wait = max(base, min(300.0, float(retry_after))) if retry_after is not None else base
            except (TypeError, ValueError, OverflowError):
                wait = base
            logger.warning("OpenRouter transient failure: status=%s, attempt=%s/%s, retry_in=%.1fs",
                           getattr(error, "status", "?"), attempt + 1, len(delays) + 1, wait)
            sleep(wait)
    raise AssertionError("unreachable")
