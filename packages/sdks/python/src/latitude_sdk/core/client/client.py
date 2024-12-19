from typing import Dict, Optional

import requests
from requests.adapters import HTTPAdapter, Retry

from latitude_sdk.core.client.router import Router, RouterOptions
from latitude_sdk.core.common import HandlerType, LogSources, RequestBody, RequestParams
from latitude_sdk.util import BaseModel


class ClientOptions(BaseModel):
    api_key: str
    retries: int
    timeout: int
    source: LogSources
    router: RouterOptions


class Client:
    options: ClientOptions
    router: Router
    retrier: Retry

    default_headers: Dict[str, str]

    def __init__(self, options: ClientOptions):
        self.options = options
        self.router = Router(options.router)
        self.retrier = Retry(total=options.retries, backoff_factor=2, status_forcelist=[429, 500, 502, 503, 504])

        self.default_headers = {
            "Authorization": f"Bearer {options.api_key}",
            "Content-Type": "application/json",
        }

    def request(
        self, handler: HandlerType, params: RequestParams, body: Optional[RequestBody] = None
    ) -> requests.Response:
        with requests.Session() as session:
            session.mount("https://" if self.options.router.ssl else "http://", HTTPAdapter(max_retries=self.retrier))

            method, url = self.router.resolve(handler, params)

            response = session.request(
                method=method,
                url=url,
                headers=self.default_headers,
                json={**body.model_dump(), "__internal": {"source": self.options.source}} if body else None,
                timeout=self.options.timeout // 1000,
                allow_redirects=False,
                stream=True,
            )

        response.raise_for_status()

        return response
