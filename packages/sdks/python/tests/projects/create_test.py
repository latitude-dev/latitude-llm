from typing import List, cast

import httpx

from latitude_sdk import CreateProjectResult
from tests.utils import TestCase, fixtures


class TestCreateProject(TestCase):
    async def test_success(self):
        name = "project"
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(201, json=fixtures.CREATE_PROJECT_RESPONSE)
        )

        result = await self.sdk.projects.create(name)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body={
                "name": name,
            },
        )
        self.assertEqual(endpoint_mock.call_count, 1)
        self.assertEqual(result, CreateProjectResult(project=fixtures.PROJECT, version=fixtures.VERSION))

    async def test_fails(self):
        name = "project"
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.projects.create(name)
        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [
            self.assert_requested(
                request,
                method="POST",
                endpoint=endpoint,
                body={
                    "name": name,
                },
            )
            for request in requests
        ]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
