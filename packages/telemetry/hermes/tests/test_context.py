"""Tags and metadata.

A tag is the only user-controlled breakdown dimension and a session filter, so
it is what makes "compare these two agent versions" one query and one
experiment. Metadata is the filter-only half.
"""

from __future__ import annotations

from typing import Any, Dict

import latitude_telemetry_hermes.config as config
from latitude_telemetry_hermes.config import (
    MAX_METADATA_KEYS,
    MAX_TAG_CHARS,
    MAX_TAGS,
    PKG_VERSION,
    _config,
    reset_config,
)
from latitude_telemetry_hermes.context import build_session_context


class _Ctx:
    """A ctx facade backed by a config.yaml settings dict."""

    def __init__(self, settings: Dict[str, Any], profile: str = "default", reject: bool = False):
        self._settings = settings
        self.profile_name = profile
        self._reject = reject

    def get_config(self, key: str, default: Any = None) -> Any:
        if self._reject:
            raise ValueError(f"Rejected config path {key!r}")
        node: Any = self._settings
        for segment in key.split("."):
            if not isinstance(node, dict) or segment not in node:
                return default
            node = node[segment]
        return node


def _context(kw: Dict[str, Any], session_id: str = "sess-1"):
    return build_session_context(kw, _config(), session_id)


def test_derived_tags_cover_platform_agent_and_version():
    config.set_plugin_context(
        _Ctx({"agent": {"name": "alescript", "version": "2.1.0"}, "tags": ["prod"]}, profile="alescriptslack")
    )
    context = _context({"platform": "slack"})
    # The version stands alone: the agent name is already its own tag, so
    # `alescript@2.1.0` only duplicated it.
    assert list(context.tags) == ["hermes", "slack", "alescript", "2.1.0", "prod"]


def test_the_profile_names_the_agent_when_nothing_else_does():
    config.set_plugin_context(_Ctx({}, profile="scout"))
    assert list(_context({"platform": "cli"}).tags) == ["hermes", "cli", "scout"]
    assert _context({"platform": "cli"}).agent_name == "scout"


def test_the_default_profile_is_not_a_tag():
    config.set_plugin_context(_Ctx({}, profile="default"))
    assert list(_context({}).tags) == ["hermes", "cli"], "an unset platform is the CLI"


def test_a_cron_session_id_yields_a_job_tag():
    config.set_plugin_context(_Ctx({}))
    context = _context({"platform": "cron"}, session_id="cron_ai-news_20260825_095742")
    assert "cron:ai-news" in context.tags
    assert context.metadata["hermes.cron.job.id"] == "ai-news"


def test_a_session_id_that_is_not_cron_shaped_yields_no_job_tag():
    config.set_plugin_context(_Ctx({}))
    assert not any(t.startswith("cron:") for t in _context({}, session_id="20260825_095742_7b42ec").tags)


def test_user_tags_append_and_dedupe(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_TAGS", "prod, eu-west ,prod,hermes")
    reset_config()
    assert list(_context({"platform": "cli"}).tags) == ["hermes", "cli", "prod", "eu-west"]


def test_user_tags_accept_a_json_array(monkeypatch):
    monkeypatch.setenv("LATITUDE_TAGS", '["a","b"]')
    reset_config()
    assert list(_context({}).tags)[-2:] == ["a", "b"]


def test_derived_metadata_is_namespaced_and_unforgeable(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_METADATA", "deployment=staging,owner=platform-team,hermes.version=lies")
    reset_config()
    metadata = _context({"platform": "slack"}).metadata
    assert metadata["deployment"] == "staging"
    assert metadata["owner"] == "platform-team"
    assert metadata["hermes.plugin.version"] == PKG_VERSION
    assert metadata.get("hermes.version") != "lies", "a user key cannot overwrite a derived one"
    assert metadata["hermes.platform"] == "slack"


def test_metadata_accepts_a_json_object(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_METADATA", '{"deployment":"vm","replicas":3}')
    reset_config()
    metadata = _context({}).metadata
    assert metadata["deployment"] == "vm"
    assert metadata["replicas"] == "3", "non-scalars are stringified"


def test_tag_and_metadata_caps_are_enforced(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_TAGS", ",".join(f"t{i}" for i in range(MAX_TAGS + 10)) + ",x" * MAX_TAG_CHARS)
    monkeypatch.setenv(
        "LATITUDE_HERMES_METADATA",
        ",".join(f"k{i}=v{i}" for i in range(MAX_METADATA_KEYS + 10)),
    )
    reset_config()
    context = _context({})
    assert len(context.tags) == MAX_TAGS
    assert all(len(tag) <= MAX_TAG_CHARS for tag in context.tags)
    assert len(context.metadata) <= MAX_METADATA_KEYS


def test_an_over_long_metadata_value_is_dropped_not_truncated(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_METADATA", "note=" + "x" * 5000)
    reset_config()
    assert "note" not in _context({}).metadata


# --- config resolution -----------------------------------------------------


def test_env_beats_config_yaml(monkeypatch):
    config.set_plugin_context(_Ctx({"project": "from-yaml", "base_url": "https://yaml.example"}))
    monkeypatch.setenv("LATITUDE_PROJECT", "from-env")
    reset_config()
    assert _config()["project"] == "from-env"
    assert _config()["base_url"] == "https://yaml.example", "yaml still fills what the env leaves unset"


def test_config_yaml_supplies_credentials_when_the_env_is_empty(monkeypatch):
    monkeypatch.delenv("LATITUDE_API_KEY", raising=False)
    monkeypatch.delenv("LATITUDE_PROJECT", raising=False)
    config.set_plugin_context(_Ctx({"api_key": "lat_yaml", "project": "yaml-project"}))
    assert _config()["enabled"] is True
    assert _config()["api_key"] == "lat_yaml"


def test_dotted_agent_keys_are_read_from_the_settings_block():
    config.set_plugin_context(_Ctx({"agent": {"name": "alescript", "version": "2.1.0"}}))
    assert _config()["agent_name"] == "alescript"
    assert _config()["agent_version"] == "2.1.0"


def test_a_rejected_config_path_never_raises_out():
    config.set_plugin_context(_Ctx({}, reject=True))
    assert _config()["enabled"] is True, "the env still supplies credentials"
    assert _config()["tags"] == []


def test_switches_are_boolean_tolerant(monkeypatch):
    for value, expected in (("0", False), ("false", False), ("no", False), ("off", False), ("1", True), ("yes", True)):
        monkeypatch.setenv("LATITUDE_HERMES_MEMORY", value)
        reset_config()
        assert _config()["memory"] is expected


def test_the_package_version_matches_pyproject():
    from pathlib import Path

    pyproject = (Path(__file__).resolve().parents[1] / "pyproject.toml").read_text()
    assert f'version = "{PKG_VERSION}"' in pyproject
