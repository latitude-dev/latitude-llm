from typing import List, cast

import httpx

from latitude_sdk.sdk.versions import GetAllVersionsOptions
from tests.utils import TestCase, fixtures


class TestGetAllVersions(TestCase):
    async def test_success_global_options(self):
        endpoint = f"/projects/{self.project_id}/versions"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(200, json=[fixtures.VERSION_RESPONSE])
        )

        result = await self.sdk.versions.get_all()
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, [fixtures.VERSION])

    async def test_success_overrides_options(self):
        options = GetAllVersionsOptions(project_id=21)
        endpoint = f"/projects/{options.project_id}/versions"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(200, json=[fixtures.VERSION_RESPONSE])
        )

        result = await self.sdk.versions.get_all(options)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, [fixtures.VERSION])

    async def test_success_default_project_id(self):
        self.sdk._options.project_id = 21  # pyright: ignore [reportPrivateUsage]
        endpoint = "/projects/21/versions"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(200, json=[fixtures.VERSION_RESPONSE])
        )

        result = await self.sdk.versions.get_all()
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, [fixtures.VERSION])

    async def test_fails_no_project_id(self):
        self.sdk._options.project_id = None  # pyright: ignore [reportPrivateUsage]

        with self.assertRaisesRegex(ValueError, "Project ID is required"):
            await self.sdk.versions.get_all()

    async def test_fails(self):
        endpoint = f"/projects/{self.project_id}/versions"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.versions.get_all()
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [self.assert_requested(request, method="GET", endpoint=endpoint) for request in requests]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
