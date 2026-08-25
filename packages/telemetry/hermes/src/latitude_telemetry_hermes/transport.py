# ─────────────────────────── export path ───────────────────────────────────
# One daemon exporter drains a bounded queue of finished spans, coalescing them
# into requests under a size ceiling well below the ingest cap (32 MiB, with no
# gzip decode on that path). Enqueueing never blocks the agent.

from __future__ import annotations

import atexit
import json
import random
import threading
import time
from queue import Empty, Full, Queue
from typing import Any, Dict, List, Optional, Sequence
from urllib import error as _urlerr
from urllib import request as _urlreq

from .config import (
    _SSL_CONTEXT,
    EXPORT_MAX_ATTEMPTS,
    EXPORT_MAX_PAYLOAD_BYTES,
    EXPORT_QUEUE_MAX,
    _config,
    _debug,
)
from .model import _Span
from .otlp import _build_payload, _encode_options, _encode_span

_RETRY_STATUS = {408, 425, 429, 500, 502, 503, 504}

_QUEUE: Queue[List[_Span]] = Queue(maxsize=EXPORT_QUEUE_MAX)
_LOCK = threading.Lock()
_IDLE = threading.Event()
_IDLE.set()
_PENDING = 0
_WORKER: Optional[threading.Thread] = None


def _ship(spans: Optional[Sequence[_Span]]) -> None:
    """Hand finished spans to the exporter. Never blocks, never raises."""
    if not spans:
        return
    batch = list(spans)
    _start_worker()
    with _LOCK:
        global _PENDING
        _PENDING += 1
        _IDLE.clear()
    while True:
        try:
            _QUEUE.put_nowait(batch)
            return
        except Full:
            try:
                dropped = _QUEUE.get_nowait()
            except Empty:
                continue
            _debug(f"export queue full: dropped {len(dropped)} span(s)")
            _complete(1)


def _start_worker() -> None:
    global _WORKER
    if _WORKER is not None and _WORKER.is_alive():
        return
    with _LOCK:
        if _WORKER is not None and _WORKER.is_alive():
            return
        _WORKER = threading.Thread(target=_run, name="latitude-telemetry-hermes", daemon=True)
        _WORKER.start()


def _complete(batches: int) -> None:
    global _PENDING
    with _LOCK:
        _PENDING = max(0, _PENDING - batches)
        if _PENDING == 0:
            _IDLE.set()


def _run() -> None:
    while True:
        try:
            batch = _QUEUE.get()
        except Exception:  # pragma: no cover - queue never raises in practice
            return
        batches = 1
        try:
            options = _encode_options()
            encoded = [_encode_span(span, options) for span in batch]
            size = sum(len(json.dumps(span)) for span in encoded)
            # Coalesce whatever else is already queued, so a turn that closed
            # many spans at once becomes few requests rather than many.
            while size < EXPORT_MAX_PAYLOAD_BYTES:
                try:
                    extra = _QUEUE.get_nowait()
                except Empty:
                    break
                batches += 1
                for span in extra:
                    span_json = _encode_span(span, options)
                    encoded.append(span_json)
                    size += len(json.dumps(span_json))
            _post_traces(_build_payload(encoded, options.service_name))
        except Exception as exc:  # fail-open
            _debug(f"export failed: {exc}")
        finally:
            _complete(batches)


def _post_traces(payload: Dict[str, Any]) -> None:
    cfg = _config()
    url = cfg["base_url"].rstrip("/") + "/v1/traces"
    data = json.dumps(payload).encode("utf-8")
    for attempt in range(1, EXPORT_MAX_ATTEMPTS + 1):
        retry_after = _attempt_post(url, data, cfg, attempt)
        if retry_after is None:
            return
        if attempt == EXPORT_MAX_ATTEMPTS:
            _debug(f"ingest gave up after {attempt} attempt(s), dropping {len(data)} bytes")
            return
        time.sleep(retry_after)


def _attempt_post(url: str, data: bytes, cfg: Dict[str, Any], attempt: int) -> Optional[float]:
    """Returns None when the batch is done with, else the seconds to wait."""
    req = _urlreq.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['api_key']}",
            "X-Latitude-Project": cfg["project"],
        },
    )
    try:
        with _urlreq.urlopen(req, timeout=30, context=_SSL_CONTEXT) as resp:  # noqa: S310 (trusted ingest URL)
            _debug(f"ingest HTTP {resp.status} ({len(data)} bytes)")
            return None
    except _urlerr.HTTPError as exc:
        if exc.code not in _RETRY_STATUS:
            _debug(f"ingest HTTP {exc.code}, not retryable")
            return None
        _debug(f"ingest HTTP {exc.code}, retrying (attempt {attempt})")
        return _backoff(attempt, exc.headers.get("Retry-After") if exc.headers else None)
    except Exception as exc:
        _debug(f"ingest failed: {exc} (attempt {attempt})")
        return _backoff(attempt, None)


def _backoff(attempt: int, retry_after: Any) -> float:
    if retry_after:
        try:
            return min(30.0, max(0.0, float(str(retry_after).strip())))
        except ValueError:
            pass
    return min(8.0, (2 ** (attempt - 1)) * 0.5) * (0.5 + random.random())


def _flush(timeout: float = 10.0) -> None:
    """Wait for an empty queue and no in-flight request."""
    if timeout <= 0:
        return
    if not _IDLE.wait(timeout):
        _debug(f"flush timed out with {_PENDING} export batch(es) still in flight")


@atexit.register
def _flush_at_exit() -> None:
    try:
        _flush(10.0)
    except Exception:
        pass
