import re
from importlib.metadata import version as get_version
from typing import Union

from latitude_sdk.util import Model, get_package

_PEP440_PATTERN = re.compile(
    r"^(\d+(?:\.\d+){0,2})"  # major.minor.patch
    r"(?:([abcu]|rc|u)(\d+))?"  # prerelease+number
    r"(?:\.dev(\d+))?$"  # .dev+number
)

_PEP440_PRERELEASES = {
    "a": "alpha",
    "b": "beta",
    "u": "unknown",
    "rc": "rc",
}


def _to_semver(pepver: str) -> str:
    version = _PEP440_PATTERN.match(pepver)
    if not version:
        return pepver

    release, prerelease, prenumber, devnumber = version.groups()

    parts = release.split(".")
    major = parts[0] if len(parts) > 0 else "0"
    minor = parts[1] if len(parts) > 1 else "0"
    patch = parts[2] if len(parts) > 2 else "0"

    semver = f"{major}.{minor}.{patch}"
    if prerelease:
        semver += f"-{_PEP440_PRERELEASES.get(prerelease, 'unknown')}"
        if prenumber:
            semver += f".{prenumber}"
    if devnumber:
        semver += f"+dev.{devnumber}"

    return semver


def _to_info(pepver: str) -> tuple[Union[int, str], ...]:
    return tuple(int(x) if x.isdigit() else x for x in pepver.split("."))


class Version(Model):
    pep440: str
    semver: str
    info: tuple[Union[int, str], ...]


try:
    _version = get_version(get_package())
except Exception:
    _version = "0.0.0u0"

version = Version(
    pep440=_version,
    semver=_to_semver(_version),
    info=_to_info(_version),
)
