import asyncio
from contextlib import asynccontextmanager
from typing import Optional

import aiohttp

from latitude_sdk.core.client.router import Router, RouterOptions
from latitude_sdk.core.common import LogSources, RequestBody, RequestHandler, RequestParams
from latitude_sdk.util import BaseModel

RETRIABLE_STATUSES = [429, 500, 502, 503, 504]


class ClientOptions(BaseModel):
    api_key: str
    retries: int
    delay: float
    timeout: float
    source: LogSources
    router: RouterOptions


class Client:
    options: ClientOptions
    client: aiohttp.ClientSession
    router: Router

    def __init__(self, options: ClientOptions):
        self.options = options
        self.client = aiohttp.ClientSession(
            headers={
                "Authorization": f"Bearer {options.api_key}",
                "Content-Type": "application/json",
            },
            timeout=aiohttp.ClientTimeout(total=options.timeout),
        )
        self.router = Router(options.router)

    @asynccontextmanager
    async def request(self, handler: RequestHandler, params: RequestParams, body: Optional[RequestBody] = None):
        response: Optional[aiohttp.ClientResponse] = None
        attempt = 1

        while attempt <= self.options.retries:
            try:
                method, url = self.router.resolve(handler, params)

                response = await self.client.request(
                    method=method,
                    url=url,
                    json={**body.model_dump(), "__internal": {"source": self.options.source}} if body else None,
                    allow_redirects=False,
                )
                response.raise_for_status()

                yield response
                break

            except Exception as exception:
                if attempt >= self.options.retries:
                    raise exception

                if response and response.status in RETRIABLE_STATUSES:
                    await asyncio.sleep(self.options.delay * (2 ** (attempt - 1)))
                else:
                    raise exception

            finally:
                if response:
                    response.close()

                attempt += 1

    async def close(self):
        await self.client.close()
