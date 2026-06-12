"""Smoke tests over the Fern-generated client surface.

The SDK source under ``src/`` is generated — these tests only pin the
hand-maintained contract: the package imports, the clients construct, and
the documented resources exist on both the sync and async clients.
"""

import pytest

from latitude_sdk import AsyncLatitudeApiClient, LatitudeApiClient

RESOURCES = [
    "account",
    "projects",
    "members",
    "api_keys",
    "oauth_keys",
    "traces",
    "saved_searches",
    "issues",
    "incidents",
    "monitors",
    "datasets",
    "scores",
    "annotations",
]


@pytest.mark.parametrize("client_class", [LatitudeApiClient, AsyncLatitudeApiClient])
def test_client_exposes_documented_resources(client_class):
    client = client_class(token="test-token")
    for resource in RESOURCES:
        assert getattr(client, resource) is not None


def test_default_base_url_is_production():
    client = LatitudeApiClient(token="test-token")
    assert client._client_wrapper.get_base_url() == "https://api.latitude.so"


def test_base_url_override():
    client = LatitudeApiClient(token="test-token", base_url="http://localhost:8787")
    assert client._client_wrapper.get_base_url() == "http://localhost:8787"
