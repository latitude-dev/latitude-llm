from typing import List, cast

import httpx

from latitude_sdk.sdk.types import Project
from tests.utils import TestCase, fixtures


class TestGetAllProjects(TestCase):
    async def test_success(self):
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(200, json=fixtures.PROJECTS_LIST_RESPONSE)
        )

        result = await self.sdk.projects.get_all()
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)

        # Verify the result structure
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 2)

        # Check first project
        first_project = result[0]
        self.assertIsInstance(first_project, Project)
        self.assertEqual(first_project.id, fixtures.PROJECT.id)
        self.assertEqual(first_project.uuid, fixtures.PROJECT.uuid)
        self.assertEqual(first_project.name, fixtures.PROJECT.name)
        self.assertEqual(first_project.created_at, fixtures.PROJECT.created_at)
        self.assertEqual(first_project.updated_at, fixtures.PROJECT.updated_at)

        # Check second project
        second_project = result[1]
        self.assertIsInstance(second_project, Project)
        self.assertEqual(second_project.id, fixtures.PROJECTS_LIST[1].id)
        self.assertEqual(second_project.uuid, fixtures.PROJECTS_LIST[1].uuid)
        self.assertEqual(second_project.name, fixtures.PROJECTS_LIST[1].name)
        self.assertEqual(second_project.created_at, fixtures.PROJECTS_LIST[1].created_at)
        self.assertEqual(second_project.updated_at, fixtures.PROJECTS_LIST[1].updated_at)

    async def test_success_empty_list(self):
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(return_value=httpx.Response(200, json=[]))

        result = await self.sdk.projects.get_all()
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)

        # Verify empty result
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 0)

    async def test_success_single_project(self):
        single_project_response = [fixtures.PROJECT_RESPONSE]
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(200, json=single_project_response)
        )

        result = await self.sdk.projects.get_all()
        request, _ = endpoint_mock.calls.last

        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)

        # Verify single project result
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 1)

        project = result[0]
        self.assertIsInstance(project, Project)
        self.assertEqual(project.id, fixtures.PROJECT.id)
        self.assertEqual(project.uuid, fixtures.PROJECT.uuid)
        self.assertEqual(project.name, fixtures.PROJECT.name)
        self.assertEqual(project.created_at, fixtures.PROJECT.created_at)
        self.assertEqual(project.updated_at, fixtures.PROJECT.updated_at)

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

    async def test_unauthorized_fails(self):
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(
                401,
                json={
                    "name": "UnauthorizedError",
                    "message": "Invalid API key",
                    "errorCode": "unauthorized_error",
                    "details": {},
                },
            )
        )

        with self.assertRaisesRegex(Exception, "Invalid API key"):
            await self.sdk.projects.get_all()

        request, _ = endpoint_mock.calls.last
        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)

    async def test_forbidden_fails(self):
        endpoint = "/projects"
        endpoint_mock = self.gateway_mock.get(endpoint).mock(
            return_value=httpx.Response(
                403,
                json={
                    "name": "ForbiddenError",
                    "message": "Access denied to projects",
                    "errorCode": "forbidden_error",
                    "details": {},
                },
            )
        )

        with self.assertRaisesRegex(Exception, "Access denied to projects"):
            await self.sdk.projects.get_all()

        request, _ = endpoint_mock.calls.last
        self.assert_requested(request, method="GET", endpoint=endpoint)
        self.assertEqual(endpoint_mock.call_count, 1)
