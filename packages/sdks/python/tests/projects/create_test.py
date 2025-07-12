from typing import List, cast

import httpx

from latitude_sdk.sdk.projects import CreateProjectResponse
from tests.utils import TestCase, fixtures


class TestCreateProject(TestCase):
    async def test_success(self):
        project_name = "New Test Project"
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(201, json=fixtures.CREATE_PROJECT_RESPONSE)
        )

        result = await self.sdk.projects.create(project_name)
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="POST", endpoint=endpoint, body={"name": project_name})
        self.assertEqual(endpoint_mock.call_count, 1)

        # Verify the result structure
        self.assertIsInstance(result, CreateProjectResponse)
        self.assertEqual(result.project.id, fixtures.PROJECT.id)
        self.assertEqual(result.project.uuid, fixtures.PROJECT.uuid)
        self.assertEqual(result.project.name, fixtures.PROJECT.name)
        self.assertEqual(result.project.created_at, fixtures.PROJECT.created_at)
        self.assertEqual(result.project.updated_at, fixtures.PROJECT.updated_at)

        self.assertEqual(result.version.uuid, fixtures.VERSION.uuid)
        self.assertEqual(result.version.name, fixtures.VERSION.name)
        self.assertEqual(result.version.project_id, fixtures.VERSION.project_id)
        self.assertEqual(result.version.created_at, fixtures.VERSION.created_at)
        self.assertEqual(result.version.updated_at, fixtures.VERSION.updated_at)

    async def test_fails(self):
        project_name = "Failed Project"
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(500, json=fixtures.ERROR_RESPONSE)
        )

        with self.assertRaisesRegex(type(fixtures.ERROR), fixtures.ERROR.message):
            await self.sdk.projects.create(project_name)

        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore

        [
            self.assert_requested(request, method="POST", endpoint=endpoint, body={"name": project_name})
            for request in requests
        ]
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)

    async def test_empty_name_fails(self):
        project_name = ""
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(
                400,
                json={
                    "name": "BadRequestError",
                    "message": "Project name cannot be empty",
                    "errorCode": "bad_request_error",
                    "details": {},
                },
            )
        )

        with self.assertRaisesRegex(Exception, "Project name cannot be empty"):
            await self.sdk.projects.create(project_name)

        request, _ = endpoint_mock.calls.last
        self.assert_requested(request, method="POST", endpoint=endpoint, body={"name": project_name})
        self.assertEqual(endpoint_mock.call_count, 1)

    async def test_duplicate_name_fails(self):
        project_name = "Existing Project"
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.post(endpoint).mock(
            return_value=httpx.Response(
                409,
                json={
                    "name": "ConflictError",
                    "message": "Project with this name already exists",
                    "errorCode": "conflict_error",
                    "details": {},
                },
            )
        )

        with self.assertRaisesRegex(Exception, "Project with this name already exists"):
            await self.sdk.projects.create(project_name)

        requests = cast(List[httpx.Request], [request for request, _ in endpoint_mock.calls])  # type: ignore
        [
            self.assert_requested(request, method="POST", endpoint=endpoint, body={"name": project_name})
            for request in requests
        ]
        # 409 is retriable, so it should retry according to internal_options.retries
        self.assertEqual(endpoint_mock.call_count, self.internal_options.retries)
