from unittest import IsolatedAsyncioTestCase

from latitude_sdk import GatewayOptions, InternalOptions, Latitude, LatitudeOptions


class TestGetPrompt(IsolatedAsyncioTestCase):
    sdk: Latitude

    async def asyncSetUp(self):
        print("async setup")

        self.sdk = Latitude(
            api_key="fake-api-key",
            options=LatitudeOptions(
                project_id=3,
                internal=InternalOptions(
                    gateway=GatewayOptions(host="localhost", port=8787, ssl=False, api_version="v2")
                ),
            ),
        )

    def setUp(self):
        print("setup")

    async def asyncTearDown(self):
        print("async teardown")

    def tearDown(self):
        print("teardown")

    async def test_success(self):
        print("test success")
