from __future__ import annotations

import json
import threading
import time
from typing import Any, Dict, Optional
from urllib import request as _urlreq

from .config import _SSL_CONTEXT, _config, _debug

# Outstanding export threads, so session-end can join them and guarantee the
# HTTP delivery finishes before a short/one-shot run exits (daemon threads are
# killed on interpreter exit otherwise, dropping the trace).
_INFLIGHT: set[threading.Thread] = set()
_INFLIGHT_LOCK = threading.Lock()


def _post_traces(payload: Dict[str, Any]) -> None:
    cfg = _config()
    url = cfg["base_url"].rstrip("/") + "/v1/traces"
    data = json.dumps(payload).encode("utf-8")
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
        with _urlreq.urlopen(req, timeout=10, context=_SSL_CONTEXT) as resp:  # noqa: S310 (trusted ingest URL)
            _debug(f"ingest HTTP {resp.status}")
    except Exception as exc:  # fail-open
        _debug(f"ingest failed: {exc}")


def _deliver(result: Dict[str, Any]) -> None:
    try:
        _post_traces(result)
    finally:
        with _INFLIGHT_LOCK:
            _INFLIGHT.discard(threading.current_thread())


def _ship(result: Optional[Dict[str, Any]]) -> None:
    if not result:
        return
    thread = threading.Thread(target=lambda: _deliver(result), daemon=True)
    with _INFLIGHT_LOCK:
        _INFLIGHT.add(thread)
    thread.start()


def _flush(timeout: float = 10.0) -> None:
    """Join outstanding export threads so HTTP delivery completes before exit.

    Re-snapshots after each drain so a thread shipped while we were joining
    (e.g. another session finishing concurrently) is still awaited, until the
    set is empty or the deadline passes.
    """
    deadline = time.monotonic() + timeout
    while True:
        with _INFLIGHT_LOCK:
            threads = list(_INFLIGHT)
        if not threads:
            return
        for thread in threads:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                _debug(f"flush timed out with {len(threads)} export thread(s) still in-flight")
                return
            thread.join(timeout=remaining)
