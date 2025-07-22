import asyncio
import gc
import os
import tracemalloc
from typing import List, Optional
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock

import psutil
import pytest

from latitude_sdk import (
    GatewayOptions,
    GetOrCreatePromptOptions,
    InternalOptions,
    Latitude,
    LatitudeOptions,
    RunPromptOptions,
)


class MemoryMetrics:
    """Helper class to track memory and resource metrics"""

    def __init__(self) -> None:
        self.process = psutil.Process()
        self.initial_memory: Optional[int] = None
        self.peak_memory: Optional[int] = None
        self.final_memory: Optional[int] = None
        self.initial_connections: Optional[int] = None
        self.peak_connections: Optional[int] = None
        self.final_connections: Optional[int] = None
        self.tracemalloc_snapshots: List[tracemalloc.Snapshot] = []

    def start_tracking(self) -> None:
        """Start memory and resource tracking"""
        tracemalloc.start()
        gc.collect()  # Clean up before starting

        self.initial_memory = self.process.memory_info().rss
        self.peak_memory = self.initial_memory
        self.initial_connections = len(self.process.net_connections())
        self.peak_connections = self.initial_connections

        self.tracemalloc_snapshots.append(tracemalloc.take_snapshot())

    def record_current(self) -> None:
        """Record current memory and connection state"""
        current_memory = self.process.memory_info().rss
        current_connections = len(self.process.net_connections())

        if self.peak_memory is not None and current_memory > self.peak_memory:
            self.peak_memory = current_memory

        if self.peak_connections is not None and current_connections > self.peak_connections:
            self.peak_connections = current_connections

        self.tracemalloc_snapshots.append(tracemalloc.take_snapshot())

    async def stop_tracking(self) -> None:
        """Stop tracking and record final state"""
        gc.collect()  # Force garbage collection
        await asyncio.sleep(0.1)  # Allow async cleanup

        self.final_memory = self.process.memory_info().rss
        self.final_connections = len(self.process.net_connections())

        self.tracemalloc_snapshots.append(tracemalloc.take_snapshot())
        tracemalloc.stop()

    def get_memory_leak_mb(self) -> float:
        """Calculate memory leak in MB"""
        if self.initial_memory is not None and self.final_memory is not None:
            return (self.final_memory - self.initial_memory) / 1024 / 1024
        return 0.0

    def get_connection_leak(self) -> int:
        """Calculate connection leak count"""
        if self.initial_connections is not None and self.final_connections is not None:
            return self.final_connections - self.initial_connections
        return 0

    def get_tracemalloc_diff(self) -> List[tracemalloc.StatisticDiff]:
        """Get memory allocation differences from tracemalloc"""
        if len(self.tracemalloc_snapshots) >= 2:
            initial = self.tracemalloc_snapshots[0]
            final = self.tracemalloc_snapshots[-1]
            return final.compare_to(initial, "lineno")
        return []

    def print_summary(self) -> None:
        """Print a summary of memory metrics"""
        print("\n=== Memory Leak Analysis ===", flush=True)

        if self.initial_memory is not None:
            print(f"Initial Memory: {self.initial_memory / 1024 / 1024:.2f} MB", flush=True)
        if self.peak_memory is not None:
            print(f"Peak Memory: {self.peak_memory / 1024 / 1024:.2f} MB", flush=True)
        if self.final_memory is not None:
            print(f"Final Memory: {self.final_memory / 1024 / 1024:.2f} MB", flush=True)

        print(f"Memory Leak: {self.get_memory_leak_mb():.2f} MB", flush=True)
        print(f"Initial Connections: {self.initial_connections}", flush=True)
        print(f"Peak Connections: {self.peak_connections}", flush=True)
        print(f"Final Connections: {self.final_connections}", flush=True)
        print(f"Connection Leak: {self.get_connection_leak()}", flush=True)

        # Print top memory allocations
        top_stats = self.get_tracemalloc_diff()[:10]
        if top_stats:
            print("\nTop 10 memory allocation differences:", flush=True)
            for index, stat in enumerate(top_stats):
                print(f"{index + 1}. {stat}", flush=True)


class TestSDKMemoryLeaks(IsolatedAsyncioTestCase):
    """Test for memory leaks in SDK streaming operations"""

    def setUp(self) -> None:
        self.maxDiff = None

        self.api_key = os.getenv("TEST_LATITUDE_API_KEY", "test-api-key")
        self.prompt_path = "memory-test-prompt"
        self.prompt_content = """
---
provider: OpenAI
model: gpt-4.1-mini
tools:
  test_tool:
    description: A simple test tool
    parameters:
      type: object
      properties:
        input:
          type: string
          description: Test input
---

This is a simple test prompt for memory leak testing.

Input: {{ input }}

<step>
Call the test tool with the input
</step>

<step>
This is a test step.
</step>

<step>
This is a test step.
</step>
""".strip()

    async def setup_sdk(self) -> Latitude:
        """Setup SDK for memory leak testing"""
        setup_sdk = Latitude(
            self.api_key,
            options=LatitudeOptions(
                internal=InternalOptions(
                    gateway=GatewayOptions(host="localhost", port=8787, ssl=False, api_version="v3")
                )
            ),
        )

        try:
            # Create or get project
            existing_projects = await setup_sdk.projects.get_all()
            project = next((p for p in existing_projects if p.name == "Memory Test Project"), None)

            if not project:
                result = await setup_sdk.projects.create("Memory Test Project")
                project = result.project
                version_uuid = result.version.uuid
            else:
                version_uuid = "live"

            # Create or get prompt
            await setup_sdk.prompts.get_or_create(
                self.prompt_path,
                options=GetOrCreatePromptOptions(
                    project_id=project.id, version_uuid=version_uuid, prompt=self.prompt_content
                ),
            )

            return Latitude(
                self.api_key,
                options=LatitudeOptions(
                    project_id=project.id,
                    version_uuid=version_uuid,
                    internal=InternalOptions(
                        gateway=GatewayOptions(host="localhost", port=8787, ssl=False, api_version="v3")
                    ),
                ),
            )

        except Exception as error:
            if "ECONNREFUSED" in str(error):
                pytest.skip("Latitude service is not running on localhost:8787")
            raise error

    @pytest.mark.skip(reason="Memory leak test. Run manually when investigating performance issues.")
    async def test_streaming_response_memory_leak(self) -> None:
        """Test for memory leaks in streaming responses over multiple requests"""
        print("🧪 Starting memory leak test for streaming responses...", flush=True)

        sdk = await self.setup_sdk()
        metrics = MemoryMetrics()

        # Mock tool that simulates some processing
        test_tool = AsyncMock(return_value="Tool executed successfully")

        print("📊 Starting memory tracking...", flush=True)
        metrics.start_tracking()

        try:
            # Perform multiple streaming requests to detect leaks
            num_iterations = 50
            print(f"\nPerforming {num_iterations} streaming requests...", flush=True)

            for i in range(num_iterations):
                try:
                    result = await sdk.prompts.run(
                        self.prompt_path,
                        options=RunPromptOptions(
                            parameters={"input": f"test_input_{i}"}, stream=True, tools={"test_tool": test_tool}
                        ),
                    )

                    # Verify we got a result
                    assert result is not None

                    # Record metrics every 10 iterations
                    if i % 10 == 0:
                        metrics.record_current()
                        print(f"Completed {i + 1}/{num_iterations} requests", flush=True)

                except Exception as e:
                    print(f"Request {i} failed: {e}", flush=True)
                    continue

                # Small delay to allow cleanup
                await asyncio.sleep(0.01)

            # Force cleanup and wait
            await asyncio.sleep(1)

        finally:
            await metrics.stop_tracking()
            metrics.print_summary()

        # Assert no significant memory leak (threshold: 50MB)
        memory_leak_mb = metrics.get_memory_leak_mb()
        connection_leak = metrics.get_connection_leak()

        print("\nAssertion checks:", flush=True)
        print(f"Memory leak: {memory_leak_mb:.2f} MB (threshold: 50 MB)", flush=True)
        print(f"Connection leak: {connection_leak} (threshold: 10)", flush=True)

        # These assertions might need adjustment based on actual behavior
        assert memory_leak_mb <= 0, f"Memory leak detected: {memory_leak_mb:.2f} MB"
        assert connection_leak <= 0, f"Connection leak detected: {connection_leak} connections"

    @pytest.mark.skip(reason="Memory leak test. Run manually when investigating performance issues.")
    async def test_mixed_streaming_non_streaming_memory_leak(self) -> None:
        """Test for memory leaks with mixed streaming and non-streaming requests"""
        sdk = await self.setup_sdk()
        metrics = MemoryMetrics()

        test_tool = AsyncMock(return_value="Tool executed")

        metrics.start_tracking()

        try:
            num_iterations = 30
            print(f"\nPerforming {num_iterations} mixed requests (streaming and non-streaming)...", flush=True)

            for i in range(num_iterations):
                try:
                    # Alternate between streaming and non-streaming
                    use_streaming = i % 2 == 0

                    result = await sdk.prompts.run(
                        self.prompt_path,
                        options=RunPromptOptions(
                            parameters={"input": f"mixed_test_{i}"},
                            stream=use_streaming,
                            tools={"test_tool": test_tool} if use_streaming else None,
                        ),
                    )

                    assert result is not None

                    if i % 5 == 0:
                        metrics.record_current()
                        print(f"Completed {i + 1}/{num_iterations} requests (streaming: {use_streaming})", flush=True)

                except Exception as e:
                    print(f"Request {i} failed: {e}", flush=True)
                    continue

                await asyncio.sleep(0.01)

            await asyncio.sleep(1)

        finally:
            await metrics.stop_tracking()
            metrics.print_summary()

        # Assert no significant leaks
        memory_leak_mb = metrics.get_memory_leak_mb()
        connection_leak = metrics.get_connection_leak()

        assert memory_leak_mb <= 0, f"Memory leak in mixed mode: {memory_leak_mb:.2f} MB"
        assert connection_leak <= 0, f"Connection leak in mixed mode: {connection_leak} connections"

    @pytest.mark.skip(reason="Memory leak test. Run manually when investigating performance issues.")
    async def test_concurrent_streaming_requests_memory_leak(self) -> None:
        """Test for memory leaks with concurrent streaming requests"""
        sdk = await self.setup_sdk()
        metrics = MemoryMetrics()

        test_tool = AsyncMock(return_value="Concurrent tool executed")

        metrics.start_tracking()

        async def single_request(request_id: int) -> bool:
            """Execute a single streaming request"""
            try:
                result = await sdk.prompts.run(
                    self.prompt_path,
                    options=RunPromptOptions(
                        parameters={"input": f"concurrent_test_{request_id}"},
                        stream=True,
                        tools={"test_tool": test_tool},
                    ),
                )
                return result is not None
            except Exception as e:
                print(f"Concurrent request {request_id} failed: {e}", flush=True)
                return False

        try:
            # Execute concurrent requests in batches
            batch_size = 5
            num_batches = 10

            print(f"\nPerforming {num_batches} batches of {batch_size} concurrent requests...", flush=True)

            for batch in range(num_batches):
                # Create batch of concurrent requests
                tasks = [single_request(batch * batch_size + i) for i in range(batch_size)]

                # Wait for batch completion
                results = await asyncio.gather(*tasks, return_exceptions=True)
                successful = sum(1 for r in results if r is True)

                metrics.record_current()
                print(f"Batch {batch + 1}/{num_batches}: {successful}/{batch_size} successful", flush=True)

                # Small delay between batches
                await asyncio.sleep(0.1)

            await asyncio.sleep(2)  # Allow longer cleanup time for concurrent requests

        finally:
            await metrics.stop_tracking()
            metrics.print_summary()

        # Assert no significant leaks with concurrent access
        memory_leak_mb = metrics.get_memory_leak_mb()
        connection_leak = metrics.get_connection_leak()

        assert memory_leak_mb <= 0, f"Memory leak with concurrent requests: {memory_leak_mb:.2f} MB"
        assert connection_leak <= 0, f"Connection leak with concurrent requests: {connection_leak} connections"
