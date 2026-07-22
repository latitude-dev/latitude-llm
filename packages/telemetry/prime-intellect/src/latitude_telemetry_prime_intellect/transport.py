from __future__ import annotations

import json
import threading
import time
from typing import Any, Dict, Optional
from urllib import error as _urlerror
from urllib import request as _urlreq

from .config import _SSL_CONTEXT, _config, _debug

_INFLIGHT: set[threading.Thread] = set()
_INFLIGHT_LOCK = threading.Lock()


def _post_json(
    url: str,
    payload: Dict[str, Any],
    headers: Dict[str, str],
    *,
    retries: int = 0,
    retry_statuses: tuple[int, ...] = (),
    retry_delay_s: float = 0.5,
) -> None:
    data = json.dumps(payload).encode("utf-8")
    attempt = 0
    while True:
        req = _urlreq.Request(url, data=data, method="POST", headers=headers)
        try:
            with _urlreq.urlopen(req, timeout=15, context=_SSL_CONTEXT) as resp:  # noqa: S310
                _debug(f"HTTP {resp.status} {url}")
                return
        except _urlerror.HTTPError as exc:
            body = ""
            try:
                body = exc.read().decode("utf-8", errors="replace")[:300]
            except Exception:
                pass
            if attempt < retries and exc.code in retry_statuses:
                attempt += 1
                _debug(f"HTTP {exc.code} {url} (retry {attempt}/{retries}): {body}")
                time.sleep(retry_delay_s * attempt)
                continue
            _debug(f"request failed ({url}): HTTP Error {exc.code}: {exc.reason} {body}")
            return
        except Exception as exc:
            _debug(f"request failed ({url}): {exc}")
            return


def _post_traces(payload: Dict[str, Any]) -> None:
    cfg = _config()
    url = cfg["base_url"].rstrip("/") + "/v1/traces"
    _post_json(
        url,
        payload,
        {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['api_key']}",
            "X-Latitude-Project": cfg["project"],
        },
    )


def _post_score(payload: Dict[str, Any]) -> None:
    cfg = _config()
    url = f"{cfg['api_base_url'].rstrip('/')}/v1/projects/{cfg['project']}/scores"
    # Scores resolve the target trace in ClickHouse; retry briefly while ingest catches up.
    _post_json(
        url,
        payload,
        {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['api_key']}",
        },
        retries=8,
        retry_statuses=(404,),
        retry_delay_s=0.4,
    )


def _deliver(kind: str, payload: Dict[str, Any]) -> None:
    try:
        if kind == "traces":
            _post_traces(payload)
        elif kind == "score":
            _post_score(payload)
    finally:
        with _INFLIGHT_LOCK:
            _INFLIGHT.discard(threading.current_thread())


def _ship(result: Optional[Dict[str, Any]], kind: str = "traces") -> None:
    if not result:
        return
    thread = threading.Thread(target=lambda: _deliver(kind, result), daemon=True)
    with _INFLIGHT_LOCK:
        _INFLIGHT.add(thread)
    thread.start()


def _flush(timeout: float = 15.0) -> None:
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
