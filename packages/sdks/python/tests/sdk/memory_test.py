import asyncio
import gc
import os
from typing import List
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

# Global list to simulate memory leaks for testing
_LEAKED_OBJECTS: List[bytes] = []


class TestMemoryLeaks(IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.maxDiff = None

        self.api_key = os.getenv("TEST_LATITUDE_API_KEY", "test-api-key")
        self.prompt_path = "memory-test-prompt"
        self.prompt_content = """
---
provider: openai
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
        setup_sdk = Latitude(
            self.api_key,
            options=LatitudeOptions(
                internal=InternalOptions(
                    gateway=GatewayOptions(host="localhost", port=8787, ssl=False, api_version="v3")
                )
            ),
        )

        # Create project
        result = await setup_sdk.projects.create("Memory Leak Test")
        project = result.project
        version_uuid = result.version.uuid

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

    @pytest.mark.skip(reason="Memory leak test. Run manually when investigating performance issues.")
    async def test_streaming_response_memory_leak(self) -> None:
        """Test for memory leaks in streaming responses using multi-cycle methodology"""
        sdk = await self.setup_sdk()
        test_tool = AsyncMock(return_value="Tool executed successfully")

        # Run multiple cycles to detect linear growth patterns
        cycle_memories: List[float] = []
        cycle_connections: List[int] = []

        num_cycles = 5
        requests_per_cycle = 10

        for cycle in range(num_cycles):
            gc.collect()  # Force cleanup before each cycle
            await asyncio.sleep(0.5)  # Allow async cleanup
            # Perform requests for this cycle
            for i in range(requests_per_cycle):
                try:
                    result = await sdk.prompts.run(
                        self.prompt_path,
                        options=RunPromptOptions(
                            parameters={"input": f"cycle_{cycle}_request_{i}"},
                            stream=True,
                            tools={"test_tool": test_tool},
                        ),
                    )
                    assert result is not None
                except Exception:
                    continue

                await asyncio.sleep(0.01)

            # Allow cleanup after cycle
            gc.collect()
            await asyncio.sleep(1)

            # Record memory at end of cycle
            cycle_end_memory = psutil.Process().memory_info().rss / 1024 / 1024  # MB
            cycle_end_connections = len(psutil.Process().net_connections())

            cycle_memories.append(cycle_end_memory)
            cycle_connections.append(cycle_end_connections)

        # Ensure we completed enough cycles for meaningful analysis
        assert len(cycle_memories) == num_cycles, f"Expected {num_cycles} cycles, got {len(cycle_memories)}"
        assert len(cycle_memories) >= 3, f"Need at least 3 cycles for leak detection, got {len(cycle_memories)}"

        # Calculate growth rate across cycles
        memory_growth_rate = (cycle_memories[-1] - cycle_memories[0]) / num_cycles
        connection_growth_rate = (cycle_connections[-1] - cycle_connections[0]) / num_cycles

        print("\nMemory growth analysis:", flush=True)
        print(f"Cycle memories (MB): {[f'{m:.2f}' for m in cycle_memories]}", flush=True)
        print(f"Memory growth rate: {memory_growth_rate:.2f} MB/cycle", flush=True)
        print(f"Connection growth rate: {connection_growth_rate:.2f} connections/cycle", flush=True)

        # Assert reasonable growth rates (allow some growth but detect leaks)
        msg = f"Potential memory leak: {memory_growth_rate:.2f} MB/cycle growth"
        assert memory_growth_rate < 5.0, msg
        msg = f"Connection leak: {connection_growth_rate:.2f} connections/cycle growth"
        assert connection_growth_rate < 1.0, msg

    @pytest.mark.skip(reason="Memory leak test. Run manually when investigating performance issues.")
    async def test_mixed_streaming_non_streaming_memory_leak(self) -> None:
        """Test for memory leaks in mixed streaming/non-streaming responses"""
        sdk = await self.setup_sdk()
        test_tool = AsyncMock(return_value="Tool executed")

        cycle_memories: List[float] = []
        cycle_connection_counts: List[int] = []

        num_cycles = 5
        requests_per_cycle = 8  # 4 streaming + 4 non-streaming per cycle

        for cycle in range(num_cycles):
            gc.collect()
            await asyncio.sleep(0.5)

            # Perform mixed requests for this cycle
            for i in range(requests_per_cycle):
                try:
                    # Alternate between streaming and non-streaming
                    use_streaming = i % 2 == 0

                    result = await sdk.prompts.run(
                        self.prompt_path,
                        options=RunPromptOptions(
                            parameters={"input": f"mixed_cycle_{cycle}_request_{i}"},
                            stream=use_streaming,
                            tools={"test_tool": test_tool} if use_streaming else None,
                        ),
                    )
                    assert result is not None
                except Exception:
                    continue

                await asyncio.sleep(0.01)

            # Cleanup and measure
            gc.collect()
            await asyncio.sleep(1)

            cycle_memory = psutil.Process().memory_info().rss / 1024 / 1024
            cycle_connection_count = len(psutil.Process().net_connections())

            cycle_memories.append(cycle_memory)
            cycle_connection_counts.append(cycle_connection_count)

        # Ensure we completed enough cycles for meaningful analysis
        assert len(cycle_memories) == num_cycles, f"Expected {num_cycles} cycles, got {len(cycle_memories)}"
        assert len(cycle_memories) >= 3, f"Need at least 3 cycles for leak detection, got {len(cycle_memories)}"

        # Analyze growth patterns
        memory_growth_rate = (cycle_memories[-1] - cycle_memories[0]) / num_cycles
        connection_growth_rate = (cycle_connection_counts[-1] - cycle_connection_counts[0]) / num_cycles

        print("\nMixed mode growth analysis:", flush=True)
        print(f"Memory growth rate: {memory_growth_rate:.2f} MB/cycle", flush=True)
        print(f"Connection growth rate: {connection_growth_rate:.2f} connections/cycle", flush=True)

        msg = f"Mixed mode memory leak: {memory_growth_rate:.2f} MB/cycle"
        assert memory_growth_rate < 5.0, msg
        msg = f"Mixed mode connection leak: {connection_growth_rate:.2f} connections/cycle"
        assert connection_growth_rate < 1.0, msg

    @pytest.mark.skip(reason="Memory leak test. Run manually when investigating performance issues.")
    async def test_concurrent_streaming_requests_memory_leak(self) -> None:
        """Test for memory leaks with concurrent streaming requests"""
        sdk = await self.setup_sdk()
        test_tool = AsyncMock(return_value="Concurrent tool executed")

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
            except Exception:
                return False

        cycle_memories: List[float] = []
        cycle_connection_counts: List[int] = []

        num_cycles = 5
        concurrent_requests_per_cycle = 8

        for cycle in range(num_cycles):
            gc.collect()
            await asyncio.sleep(0.5)

            # Execute concurrent requests for this cycle
            tasks = [
                single_request(cycle * concurrent_requests_per_cycle + i) for i in range(concurrent_requests_per_cycle)
            ]

            # Wait for all concurrent requests to complete
            await asyncio.gather(*tasks, return_exceptions=True)

            # Allow cleanup after concurrent operations
            gc.collect()
            await asyncio.sleep(2)  # Longer cleanup for concurrent requests

            cycle_memory = psutil.Process().memory_info().rss / 1024 / 1024
            cycle_connection_count = len(psutil.Process().net_connections())

            cycle_memories.append(cycle_memory)
            cycle_connection_counts.append(cycle_connection_count)

        # Ensure we completed enough cycles for meaningful analysis
        assert len(cycle_memories) == num_cycles, f"Expected {num_cycles} cycles, got {len(cycle_memories)}"
        assert len(cycle_memories) >= 3, f"Need at least 3 cycles for leak detection, got {len(cycle_memories)}"

        # Analyze growth patterns for concurrent requests
        memory_growth_rate = (cycle_memories[-1] - cycle_memories[0]) / num_cycles
        connection_growth_rate = (cycle_connection_counts[-1] - cycle_connection_counts[0]) / num_cycles

        print("\nConcurrent requests growth analysis:", flush=True)
        print(f"Memory growth rate: {memory_growth_rate:.2f} MB/cycle", flush=True)
        print(f"Connection growth rate: {connection_growth_rate:.2f} connections/cycle", flush=True)

        # More lenient thresholds for concurrent requests due to connection pooling
        msg = f"Concurrent memory leak: {memory_growth_rate:.2f} MB/cycle"
        assert memory_growth_rate < 10.0, msg
        msg = f"Concurrent connection leak: {connection_growth_rate:.2f} connections/cycle"
        assert connection_growth_rate < 2.0, msg

    @pytest.mark.skip(reason="Memory leak test. Run manually to validate leak detection works.")
    async def test_detection_intentional_memory_leak(self) -> None:
        """
        Test that our memory leak detection methodology works by intentionally leaking memory.
        """
        sdk = await self.setup_sdk()
        test_tool = AsyncMock(return_value="Tool executed")

        cycle_memories: List[float] = []
        cycle_connections: List[int] = []

        num_cycles = 5
        requests_per_cycle = 5
        leak_size_mb = 2  # Leak 2MB per cycle

        print("\n🧪 Testing intentional memory leak detection...", flush=True)

        for cycle in range(num_cycles):
            gc.collect()
            await asyncio.sleep(0.5)

            # Perform requests for this cycle
            for i in range(requests_per_cycle):
                try:
                    result = await sdk.prompts.run(
                        self.prompt_path,
                        options=RunPromptOptions(
                            parameters={"input": f"leak_test_cycle_{cycle}_request_{i}"},
                            stream=True,
                            tools={"test_tool": test_tool},
                        ),
                    )
                    assert result is not None

                    # INTENTIONALLY LEAK MEMORY: Create large objects and store references
                    large_data = b"x" * (leak_size_mb * 1024 * 1024 // requests_per_cycle)  # Split leak across requests
                    _LEAKED_OBJECTS.append(large_data)  # This creates a memory leak!

                except Exception:
                    continue

                await asyncio.sleep(0.01)

            # Cleanup and measure (but leaked objects remain in _LEAKED_OBJECTS)
            gc.collect()
            await asyncio.sleep(1)

            cycle_memory = psutil.Process().memory_info().rss / 1024 / 1024
            cycle_connection_count = len(psutil.Process().net_connections())

            cycle_memories.append(cycle_memory)
            cycle_connections.append(cycle_connection_count)

            leaked_mb = len(_LEAKED_OBJECTS) * leak_size_mb / requests_per_cycle
            print(f"Cycle {cycle + 1}: {cycle_memory:.2f} MB, leaked ~{leaked_mb:.1f} MB", flush=True)

        # Ensure we completed enough cycles for meaningful analysis
        assert len(cycle_memories) == num_cycles, f"Expected {num_cycles} cycles, got {len(cycle_memories)}"
        assert len(cycle_memories) >= 3, f"Need at least 3 cycles for leak detection, got {len(cycle_memories)}"

        # Analyze growth patterns - this should detect the intentional leak
        memory_growth_rate = (cycle_memories[-1] - cycle_memories[0]) / num_cycles
        connection_growth_rate = (cycle_connections[-1] - cycle_connections[0]) / num_cycles

        print("\n📊 Intentional leak analysis:", flush=True)
        print(f"Memory growth rate: {memory_growth_rate:.2f} MB/cycle", flush=True)
        print(f"Expected growth rate: ~{leak_size_mb:.2f} MB/cycle", flush=True)
        print(f"Connection growth rate: {connection_growth_rate:.2f} connections/cycle", flush=True)

        # Clean up the leaked objects for subsequent tests
        _LEAKED_OBJECTS.clear()
        gc.collect()

        # This test should FAIL if our detection works correctly
        assert memory_growth_rate < 1.0, f"Memory leak detected as expected: {memory_growth_rate:.2f} MB/cycle"
        print("❌ UNEXPECTED: No memory leak detected - our test methodology may need improvement", flush=True)
