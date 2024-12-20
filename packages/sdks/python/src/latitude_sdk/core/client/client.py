import asyncio
from contextlib import asynccontextmanager
from typing import Optional

import httpx
import httpx_sse

from latitude_sdk.core.client.router import Router, RouterOptions
from latitude_sdk.core.common import LogSources, RequestBody, RequestHandler, RequestParams
from latitude_sdk.util import BaseModel

RETRIABLE_STATUSES = [429, 500, 502, 503, 504]

ClientResponse = httpx.Response


class ClientOptions(BaseModel):
    api_key: str
    retries: int
    delay: float
    timeout: float
    source: LogSources
    router: RouterOptions


# TODO: Type return types
class Client:
    options: ClientOptions
    router: Router

    def __init__(self, options: ClientOptions):
        self.options = options
        self.router = Router(options.router)

    @asynccontextmanager
    async def request(self, handler: RequestHandler, params: RequestParams, body: Optional[RequestBody] = None):
        client = httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {self.options.api_key}",
                "Content-Type": "application/json",
            },
            timeout=self.options.timeout,
            follow_redirects=False,
            max_redirects=0,
        )
        response = None
        attempt = 1

        try:
            while attempt <= self.options.retries:
                try:
                    method, url = self.router.resolve(handler, params)

                    response = await client.request(
                        method=method,
                        url=url,
                        json={**body.model_dump(), "__internal": {"source": self.options.source}} if body else None,
                    )
                    response.raise_for_status()

                    yield response
                    break

                # TODO: Raise LatitudeException instead
                except Exception as exception:
                    if attempt >= self.options.retries:
                        raise exception

                    if response and response.status_code in RETRIABLE_STATUSES:
                        await asyncio.sleep(self.options.delay * (2 ** (attempt - 1)))
                    else:
                        raise exception

                finally:
                    if response:
                        await response.aclose()

                    attempt += 1
        finally:
            await client.aclose()

    @staticmethod
    async def json(response: ClientResponse):
        return response.json()

    @staticmethod
    async def sse(response: ClientResponse):
        source = httpx_sse.EventSource(response)

        async for event in source.aiter_sse():
            yield event
