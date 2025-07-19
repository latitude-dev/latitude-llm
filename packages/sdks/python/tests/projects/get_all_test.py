from typing import List, cast

import httpx

from tests.utils import TestCase, fixtures


class TestGetAllProjects(TestCase):
    async def test_success_empty(self):
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(return_value=httpx.Response(200, json=[]))

        result = await self.sdk.projects.get_all()
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, [])

    async def test_success_single(self):
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(200, json=[fixtures.PROJECT_RESPONSE])
        )

        result = await self.sdk.projects.get_all()
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, [fixtures.PROJECT])

    async def test_success_multiple(self):
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.PROJECTS_RESPONSE)
        )

        result = await self.sdk.projects.get_all()
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, fixtures.PROJECTS)

    async def test_fails(self):
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.projects.get_all()
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [self.assert_requested(request, method="GET", endpoint=endpoint) for request in requests]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
