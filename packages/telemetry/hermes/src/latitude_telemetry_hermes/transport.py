from __future__ import annotations

import json
import threading
from typing import Any, Dict, Optional
from urllib import request as _urlreq

from .config import _SSL_CONTEXT, _config, _debug


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


def _ship(result: Optional[Dict[str, Any]]) -> None:
    if not result:
        return
    threading.Thread(target=_post_traces, args=(result,), daemon=True).start()
