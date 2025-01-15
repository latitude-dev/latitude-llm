import os
from enum import Enum
from importlib.metadata import distributions
from typing import Any, Callable, List, TypeVar

import pydantic
from typing_extensions import ParamSpec, Self

T = TypeVar("T", str, bool, int, List[str])


def get_env(key: str, default: T) -> T:
    value = os.getenv(key)
    if not value:
        return default

    if isinstance(default, str):
        return value

    elif isinstance(default, bool):
        return value.lower() in ["true", "1", "yes", "on"]

    elif isinstance(default, int):
        return int(value)

    elif isinstance(default, list):
        return value.split(",")

    raise TypeError(f"Unknown type {type(default)}")


_INSTALLED_PACKAGES = {dist.metadata["Name"].lower() for dist in distributions()}


def is_package_installed(package: str) -> bool:
    return package.lower() in _INSTALLED_PACKAGES


P = ParamSpec("P")
R = TypeVar("R")


def returns_identity(x: R) -> R:
    return x


def is_like(func: Callable[P, R]) -> Callable[[Callable[..., Any]], Callable[P, R]]:
    return returns_identity  # type: ignore


def returns_like(func: Callable[..., R]) -> Callable[[Callable[P, Any]], Callable[P, R]]:
    return returns_identity  # type: ignore


class StrEnum(str, Enum):
    def __str__(self) -> str:
        return str(self.value)

    @classmethod
    def entries(cls) -> List[Self]:
        return list(cls)

    @classmethod
    def names(cls) -> List[str]:
        return [v.name for v in cls]

    @classmethod
    def values(cls) -> List[str]:
        return [v.value for v in cls]


Field = pydantic.Field
Config = pydantic.ConfigDict


class Model(pydantic.BaseModel):
    model_config = Config(populate_by_name=True, arbitrary_types_allowed=True, strict=True)

    @is_like(pydantic.BaseModel.__iter__)
    def __iter__(self) -> Any:
        yield from [(k, v) for k, v in super().__iter__() if v is not None]

    @is_like(pydantic.BaseModel.model_dump)
    def model_dump(self, *args: Any, **kwargs: Any) -> Any:
        exclude_none = kwargs.pop("exclude_none", True)
        return super().model_dump(*args, exclude_none=exclude_none, **kwargs)

    @is_like(pydantic.BaseModel.dict)  # pyright: ignore [reportDeprecated]
    def dict(self, *args: Any, **kwargs: Any) -> Any:
        exclude_none = kwargs.pop("exclude_none", True)
        return super().dict(*args, exclude_none=exclude_none, **kwargs)  # pyright: ignore [reportDeprecated]

    @is_like(pydantic.BaseModel.model_dump_json)
    def model_dump_json(self, *args: Any, **kwargs: Any) -> Any:
        exclude_none = kwargs.pop("exclude_none", True)
        by_alias = kwargs.pop("by_alias", True)
        return super().model_dump_json(*args, exclude_none=exclude_none, by_alias=by_alias, **kwargs)

    @is_like(pydantic.BaseModel.json)  # pyright: ignore [reportDeprecated]
    def json(self, *args: Any, **kwargs: Any) -> Any:
        exclude_none = kwargs.pop("exclude_none", True)
        by_alias = kwargs.pop("by_alias", True)
        return super().json(*args, exclude_none=exclude_none, by_alias=by_alias, **kwargs)  # pyright: ignore [reportDeprecated]
