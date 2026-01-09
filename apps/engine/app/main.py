import asyncio
import signal

from app.core.gepa import register_gepa_handlers
from app.rpc.server import RpcServer


def register(server: RpcServer) -> None:
    """Register all handlers for the RPC server."""

    register_gepa_handlers(server)


async def main() -> None:
    """Main entry point for the engine RPC server."""

    server = RpcServer()
    loop = asyncio.get_running_loop()

    def handle_signal(_: signal.Signals) -> None:
        server.abort()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, handle_signal, sig)

    register(server)

    await server.run()


if __name__ == "__main__":
    asyncio.run(main())
