import asyncio
import sys
import traceback
from collections.abc import Sequence
from typing import Any, Awaitable, Callable

from pydantic import ValidationError

from app.rpc.protocol import (
    JsonRpcEmptyResponse,
    JsonRpcError,
    JsonRpcRequest,
    JsonRpcResponse,
    RpcErrorCode,
    parse_message,
    serialize_message,
)
from app.util import Model

ENGINE_READ_LIMIT = 16 * 1024 * 1024  # 16MB limit for large system of prompts

type Handler[P: Model, R: Model] = Callable[["RpcServer", P], Awaitable[R]]
type ResponseModel[R: Model] = type[R]


class HandlerRegistration[P: Model, R: Model]:
    """Registration of a handler with its parameter model type."""

    def __init__(self, handler: Handler[P, R], params_model: type[P]) -> None:
        self.handler = handler
        self.params_model = params_model


class RpcServer:
    """
    Bidirectional JSON-RPC server over stdin/stdout.

    Handles incoming requests from TypeScript and can send outgoing
    requests back to TypeScript. Uses Pydantic models for type-safe
    parameter validation and serialization.
    """

    def __init__(self) -> None:
        self._handlers: dict[str, HandlerRegistration[Any, Any]] = {}
        self._pending_responses: dict[int | str, asyncio.Future[Any]] = {}
        self._next_id = 1
        self._running = False
        self._aborted = asyncio.Event()
        self._write_lock = asyncio.Lock()
        self._reader_task: asyncio.Task[None] | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._writer: asyncio.StreamWriter | None = None

    @property
    def aborted(self) -> bool:
        """Event that is set when the server is aborted (killed or EOF)."""

        return self._aborted.is_set()

    def raise_for_aborted(self) -> None:
        """Raise an exception if the server is aborted."""

        if self._aborted.is_set():
            raise InterruptedError("RPC server has aborted")

    def register[P: Model, R: Model](
        self,
        method: str,
        handler: Handler[P, R],
        params_model: type[P],
    ) -> None:
        """Register a handler for an incoming RPC method with its parameter model."""

        self._handlers[method] = HandlerRegistration(handler, params_model)

    async def call[R: Model](
        self,
        method: str,
        params: Model,
        response_model: type[R] = JsonRpcEmptyResponse,
    ) -> R:
        """Send an RPC request to TypeScript and wait for the response.

        Args:
            method: The RPC method name
            params: The parameters as a Pydantic model
            response_model: Pydantic model to validate and parse the response

        Returns:
            The validated response model
        """

        self.raise_for_aborted()

        request_id = self._next_id
        self._next_id += 1

        request = JsonRpcRequest(method=method, params=params.model_dump(), id=request_id)

        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._pending_responses[request_id] = future

        try:
            await self._write(serialize_message(request))
            result = await future
            return response_model.model_validate(result)
        finally:
            self._pending_responses.pop(request_id, None)

    def scall[R: Model](
        self,
        method: str,
        params: Model,
        response_model: type[R] = JsonRpcEmptyResponse,
    ) -> R:
        """Synchronous version of call() for use in non-async contexts.

        Schedules the async call on the event loop and blocks until complete.
        Must be called from a different thread than the event loop (e.g., from
        code running in a thread pool executor).

        Args:
            method: The RPC method name
            params: The parameters as a Pydantic model
            response_model: Pydantic model to validate and parse the response

        Returns:
            The validated response model
        """

        if self._loop is None:
            raise RuntimeError("RPC server is not running")

        if not self._loop.is_running():
            raise RuntimeError("Event loop is not running")

        future = asyncio.run_coroutine_threadsafe(
            self.call(method, params, response_model),
            self._loop,
        )
        result = future.result()
        return result

    def sbatch[R: Model](
        self,
        method: str,
        params_list: Sequence[Model],
        response_model: type[R] = JsonRpcEmptyResponse,
        batch_size: int | None = None,
    ) -> list[R]:
        """Execute multiple RPC calls concurrently and wait for all to complete.

        All calls use the same method and response model. This is much faster
        than calling scall() sequentially when you have multiple independent calls.

        Args:
            method: The RPC method name (same for all calls)
            params_list: List of parameters for each call
            response_model: Pydantic model to validate responses (same for all)
            batch_size: Optional max number of concurrent calls. If None, all calls
                        are made concurrently. If set, calls are made in chunks of
                        this size, waiting for each chunk to complete before starting
                        the next.

        Returns:
            List of validated response models in the same order as params_list

        Raises:
            RuntimeError: If any call fails, the first error is raised
        """

        if not params_list:
            return []

        if self._loop is None:
            raise RuntimeError("RPC server is not running")

        if not self._loop.is_running():
            raise RuntimeError("Event loop is not running")

        async def batch_calls() -> list[R]:
            if batch_size is None or batch_size <= 0:
                coros = [self.call(method, params, response_model) for params in params_list]
                return list(await asyncio.gather(*coros))

            results: list[R] = []
            for i in range(0, len(params_list), batch_size):
                chunk = params_list[i : i + batch_size]
                coros = [self.call(method, params, response_model) for params in chunk]
                chunk_results = await asyncio.gather(*coros)
                results.extend(chunk_results)
            return results

        future = asyncio.run_coroutine_threadsafe(batch_calls(), self._loop)
        return future.result()

    async def run(self) -> None:
        """Start the RPC server and process messages until aborted or EOF."""

        self._running = True
        self._loop = asyncio.get_running_loop()

        write_transport, write_protocol = await self._loop.connect_write_pipe(
            asyncio.streams.FlowControlMixin,
            sys.stdout,
        )
        self._writer = asyncio.StreamWriter(write_transport, write_protocol, None, self._loop)

        self._reader_task = asyncio.create_task(self._read_loop())

        try:
            await self._reader_task
        except asyncio.CancelledError:
            pass
        finally:
            self._running = False
            self._cancel_pending()
            if self._writer:
                self._writer.close()

    def abort(self) -> None:
        """Abort the RPC server."""

        self._aborted.set()
        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()

    async def _read_loop(self) -> None:
        """Read messages from stdin and dispatch them."""

        loop = asyncio.get_running_loop()
        reader = asyncio.StreamReader(limit=ENGINE_READ_LIMIT)
        protocol = asyncio.StreamReaderProtocol(reader)

        await loop.connect_read_pipe(lambda: protocol, sys.stdin)

        while not self._aborted.is_set():
            try:
                line = await reader.readline()
                if not line:
                    break

                decoded = line.decode("utf-8").strip()
                await self._handle_message(decoded)
            except asyncio.CancelledError:
                break
            except Exception as e:
                sys.stderr.write(f"{e}\n")
                sys.stderr.flush()
                self._fail_all_pending(e)
                raise e

        self._aborted.set()

    async def _handle_message(self, line: str) -> None:
        """Parse and handle a single message."""

        if not line:
            return

        message = parse_message(line)
        if message is None:
            return

        if isinstance(message, JsonRpcRequest):
            task = asyncio.create_task(self._handle_request(message))
            task.add_done_callback(self._on_handler_done)
        elif isinstance(message, JsonRpcResponse):  # pyright: ignore [reportUnnecessaryIsInstance]
            self._handle_response(message)

    async def _handle_request(self, request: JsonRpcRequest) -> None:
        """Handle an incoming request from TypeScript."""

        registration = self._handlers.get(request.method)
        if registration is None:
            if request.id is not None:
                error = JsonRpcError(
                    code=RpcErrorCode.METHOD_NOT_FOUND,
                    message=f"Method not found: {request.method}",
                )
                response = JsonRpcResponse(id=request.id, error=error)
                await self._write(serialize_message(response))
            return

        try:
            params = registration.params_model.model_validate(request.params)
        except ValidationError as e:  # pyright: ignore [reportUnknownReturnType]
            if request.id is not None:
                error = JsonRpcError(
                    code=RpcErrorCode.INVALID_PARAMS,
                    message=f"Invalid parameters: {e}",
                )
                response = JsonRpcResponse(id=request.id, error=error)
                await self._write(serialize_message(response))
            return

        try:
            result = await registration.handler(self, params)
            if request.id is not None:
                response = JsonRpcResponse(id=request.id, result=result.model_dump())
                await self._write(serialize_message(response))
        except Exception as e:
            if request.id is not None:
                error = JsonRpcError(
                    code=RpcErrorCode.INTERNAL_ERROR,
                    message=str(e),
                    data={"traceback": traceback.format_exc()},
                )
                response = JsonRpcResponse(id=request.id, error=error)
                await self._write(serialize_message(response))

    def _handle_response(self, response: JsonRpcResponse) -> None:
        """Handle a response to one of our outgoing requests."""

        if response.id is None:
            return

        future = self._pending_responses.get(response.id)
        if future is None or future.done():
            return

        if response.error is not None:
            future.set_exception(RuntimeError(f"RPC error {response.error.code}: {response.error.message}"))
        else:
            future.set_result(response.result)

    def _on_handler_done(self, task: asyncio.Task[None]) -> None:
        """Callback for when a handler task completes. Suppresses exceptions since they are already handled."""

        if task.cancelled():
            return

        exc = task.exception()
        if exc is not None:
            pass

    async def _write(self, data: str) -> None:
        """Write data to stdout asynchronously."""

        if self._writer is None:
            raise RuntimeError("Writer not initialized")

        async with self._write_lock:
            self._writer.write(data.encode("utf-8"))
            await self._writer.drain()

    def _cancel_pending(self) -> None:
        """Cancel all pending response futures."""

        for future in self._pending_responses.values():
            if not future.done():
                future.cancel()
        self._pending_responses.clear()

    def _fail_all_pending(self, error: Exception) -> None:
        """Fail all pending response futures with the given error."""

        for future in self._pending_responses.values():
            if not future.done():
                future.set_exception(error)
        self._pending_responses.clear()
