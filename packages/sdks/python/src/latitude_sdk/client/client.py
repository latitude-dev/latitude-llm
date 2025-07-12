import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Awaitable, Callable, Optional

import httpx
import httpx_sse

from latitude_sdk.client.payloads import (
    ErrorResponse,
    RequestBody,
    RequestHandler,
    RequestParams,
)
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
        self,
        handler: RequestHandler,
        params: Optional[RequestParams] = None,
        body: Optional[RequestBody] = None,
    ) -> AsyncGenerator[ClientResponse, Any]:
        """
        Main request handler that delegates to streaming or non-streaming methods.
        """
        is_streaming = self._is_streaming_request(body)

        if is_streaming:
            async with self._streaming_request(handler, params, body) as response:
                yield response
        else:
            async with self._non_streaming_request(handler, params, body) as response:
                yield response

    def _is_streaming_request(self, body: Optional[RequestBody]) -> bool:
        """Check if this is a streaming request based on the body."""
        return body is not None and hasattr(body, "stream") and body.stream  # type: ignore

    def _prepare_headers(self, is_streaming: bool) -> dict[str, str]:
        """Prepare headers for the request."""
        headers = {
            "Authorization": f"Bearer {self.options.api_key}",
            "Content-Type": "application/json",
        }

        if is_streaming:
            headers["Accept"] = "text/event-stream"

        return headers

    def _prepare_content(self, body: Optional[RequestBody]) -> Optional[str]:
        """Prepare request content from body."""
        if not body:
            return None

        return json.dumps(
            {
                **json.loads(body.model_dump_json()),
                "__internal": {"source": self.options.source},
            }
        )

    @asynccontextmanager
    async def _streaming_request(
        self,
        handler: RequestHandler,
        params: Optional[RequestParams] = None,
        body: Optional[RequestBody] = None,
    ) -> AsyncGenerator[ClientResponse, Any]:
        """Handle streaming requests with proper resource management."""
        headers = self._prepare_headers(is_streaming=True)
        content = self._prepare_content(body)
        method, url = self.router.resolve(handler, params)

        async with httpx.AsyncClient(
            headers=headers,
            timeout=self.options.timeout,
            follow_redirects=False,
            max_redirects=0,
        ) as client:
            response = await self._execute_with_retry(
                lambda: client.stream(method=method, url=url, content=content),  # type: ignore
                is_streaming=True,
            )

            # For streaming responses, yield the response directly
            # The caller is responsible for consuming the stream
            yield response

    @asynccontextmanager
    async def _non_streaming_request(
        self,
        handler: RequestHandler,
        params: Optional[RequestParams] = None,
        body: Optional[RequestBody] = None,
    ) -> AsyncGenerator[ClientResponse, Any]:
        """Handle non-streaming requests with proper resource management."""
        headers = self._prepare_headers(is_streaming=False)
        content = self._prepare_content(body)
        method, url = self.router.resolve(handler, params)

        async with httpx.AsyncClient(
            headers=headers,
            timeout=self.options.timeout,
            follow_redirects=False,
            max_redirects=0,
        ) as client:
            response = await self._execute_with_retry(
                lambda: client.request(method=method, url=url, content=content),  # type: ignore
                is_streaming=False,
            )

            try:
                # Pre-read the response text for non-streaming responses
                # This ensures the response is fully loaded and validates it
                _ = response.text
                yield response
            finally:
                await response.aclose()

    async def _execute_with_retry(
        self,
        request_func: Callable[[], Awaitable[ClientResponse]],
        is_streaming: bool = False,
    ) -> ClientResponse:
        """Execute a request with retry logic."""
        last_exception = None
        last_response = None

        for attempt in range(1, self.options.retries + 1):
            response_cm = None
            response = None

            try:
                if is_streaming:
                    # For streaming, request_func returns a context manager
                    response_cm = request_func()
                    response = await response_cm.__aenter__()  # type: ignore
                    # Store the context manager for proper cleanup
                    response._stream_cm = response_cm  # pyright: ignore [reportAttributeAccessIssue]
                else:
                    response = await request_func()

                response.raise_for_status()  # type: ignore
                return response  # type: ignore

            except Exception as exception:
                last_exception = exception

                # For HTTP errors, get the response from the exception
                if isinstance(exception, httpx.HTTPStatusError):
                    last_response = exception.response
                else:
                    last_response = getattr(exception, "response", None)

                # Don't retry ApiErrors - they're business logic errors
                if isinstance(exception, ApiError):
                    raise exception

                # If this is the last attempt, break to raise the exception
                if attempt >= self.options.retries:
                    break

                # Check if we should retry based on status code
                if (
                    isinstance(exception, httpx.HTTPStatusError)
                    and exception.response.status_code in RETRIABLE_STATUSES
                ):
                    await asyncio.sleep(self._calculate_delay(attempt))
                    continue

                # For non-retriable errors, don't retry
                break

        # If we get here, all retries failed
        raise await self._exception(last_exception, last_response) from last_exception  # type: ignore

    def _calculate_delay(self, attempt: int) -> float:
        """Calculate exponential backoff delay."""
        return self.options.delay * (2 ** (attempt - 1))

    async def _exception(self, exception: Exception, response: Optional[httpx.Response] = None) -> ApiError:
        if not response:
            return ApiError(
                status=500,
                code=ApiErrorCodes.InternalServerError,
                message=str(exception),
                response=str(exception),
            )

        # Try to safely get response text and content, handling streaming responses
        response_text = ""
        response_content = b""

        try:
            # Check if this is a streaming response
            content_type = response.headers.get("content-type", "")
            is_streaming = "text/event-stream" in content_type

            # For streaming responses, try to read content but don't access text
            if is_streaming:
                # For streaming responses, we can access content but not text
                response_content = response.content
                response_text = ""
            else:
                # For non-streaming responses, we can safely access both
                response_content = response.content
                response_text = response.text
        except Exception:
            # If we can't read the response (e.g., streaming response that hasn't been read),
            # try to get what we can
            try:
                response_content = response.content
            except Exception:
                response_content = b""
            response_text = ""

        try:
            error = ErrorResponse.model_validate_json(response_content)

            return ApiError(
                status=response.status_code,
                code=error.code,
                message=error.message,
                response=response_text,
                db_ref=ApiErrorDbRef(**dict(error.db_ref)) if error.db_ref else None,
            )

        except Exception:
            return ApiError(
                status=response.status_code,
                code=ApiErrorCodes.InternalServerError,
                message=str(exception),
                response=response_text,
            )
