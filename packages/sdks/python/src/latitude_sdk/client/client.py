import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional

import httpx
import httpx_sse

from latitude_sdk.client.payloads import ErrorResponse, RequestBody, RequestHandler, RequestParams
from latitude_sdk.client.router import Router, RouterOptions
from latitude_sdk.sdk.errors import (
    ApiError,
    ApiErrorCodes,
    ApiErrorDbRef,
)
from latitude_sdk.sdk.types import LogSources
from latitude_sdk.util import Model

RETRIABLE_STATUSES = [408, 409, 429, 500, 502, 503, 504]

ClientEvent = httpx_sse.ServerSentEvent


class ClientResponse(httpx.Response):
    async def sse(self: httpx.Response) -> AsyncGenerator[ClientEvent, Any]:
        source = httpx_sse.EventSource(self)

        async for event in source.aiter_sse():
            yield event


httpx.Response.sse = ClientResponse.sse  # pyright: ignore [reportAttributeAccessIssue]


class ClientOptions(Model):
    api_key: str
    retries: int
    delay: float
    timeout: Optional[float]
    source: LogSources
    router: RouterOptions


class Client:
    options: ClientOptions
    router: Router

    def __init__(self, options: ClientOptions):
        self.options = options
        self.router = Router(options.router)

    @asynccontextmanager
    async def request(
        self, handler: RequestHandler, params: RequestParams, body: Optional[RequestBody] = None
    ) -> AsyncGenerator[ClientResponse, Any]:
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
            method, url = self.router.resolve(handler, params)
            content = None
            if body:
                content = json.dumps(
                    {
                        **json.loads(body.model_dump_json()),
                        "__internal": {"source": self.options.source},
                    }
                )

            while attempt <= self.options.retries:
                try:
                    response = await client.request(method=method, url=url, content=content)
                    response.raise_for_status()

                    yield response  # pyright: ignore [reportReturnType]
                    break

                except Exception as exception:
                    if isinstance(exception, ApiError):
                        raise exception

                    if attempt >= self.options.retries:
                        raise await self._exception(exception, response) from exception

                    if response and response.status_code in RETRIABLE_STATUSES:
                        await asyncio.sleep(self.options.delay * (2 ** (attempt - 1)))
                    else:
                        raise await self._exception(exception, response) from exception

                finally:
                    if response:
                        await response.aclose()

                    attempt += 1

        except Exception as exception:
            if isinstance(exception, ApiError):
                raise exception

            raise await self._exception(exception, response) from exception

        finally:
            await client.aclose()

    async def _exception(self, exception: Exception, response: Optional[httpx.Response] = None) -> ApiError:
        if not response:
            return ApiError(
                status=500,
                code=ApiErrorCodes.InternalServerError,
                message=str(exception),
                response=str(exception),
            )

        try:
            error = ErrorResponse.model_validate_json(response.content)

            return ApiError(
                status=response.status_code,
                code=error.code,
                message=error.message,
                response=response.text,
                db_ref=ApiErrorDbRef(**dict(error.db_ref)) if error.db_ref else None,
            )

        except Exception:
            return ApiError(
                status=response.status_code,
                code=ApiErrorCodes.InternalServerError,
                message=str(exception),
                response=response.text,
            )
