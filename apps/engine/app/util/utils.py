import os
from enum import Enum
from typing import Any, Callable, List

import pydantic
from typing_extensions import Self


def get_package() -> str:
    return (__package__ or __name__).split(".")[0].replace("_", "-")


def get_env[T: (str, bool, int, List[str])](key: str, default: T) -> T:
    value = os.getenv(key)
    if not value:
        return default

    if isinstance(default, str):
        return value

    elif isinstance(default, bool):
        return value.lower() in ["true", "1", "yes", "on"]

    elif isinstance(default, int):
        return int(value)

    elif isinstance(default, list):  # pyright: ignore [reportUnnecessaryIsInstance]
        return value.split(",")

    raise TypeError(f"Unknown type {type(default)}")


def returns_identity[R](x: R) -> R:
    return x


def is_like[**P, R](func: Callable[P, R]) -> Callable[[Callable[..., Any]], Callable[P, R]]:
    return returns_identity  # type: ignore


def returns_like[**P, R](func: Callable[..., R]) -> Callable[[Callable[P, Any]], Callable[P, R]]:
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
Adapter = pydantic.TypeAdapter
Aliases = pydantic.AliasChoices
Validator = pydantic.WrapValidator
ValidatorInfo = pydantic.ValidationInfo
ValidatorHandler = pydantic.ValidatorFunctionWrapHandler


class Model(pydantic.BaseModel):
    model_config = Config(populate_by_name=True, arbitrary_types_allowed=True, strict=True)

    @is_like(pydantic.BaseModel.__iter__)
    def __iter__(self) -> Any:
        yield from [(k, v) for k, v in super().__iter__() if v is not None]

    @is_like(pydantic.BaseModel.model_dump)
    def model_dump(self, *args: Any, **kwargs: Any) -> Any:
        exclude_none = kwargs.pop("exclude_none", True)
        by_alias = kwargs.pop("by_alias", True)
        return super().model_dump(*args, exclude_none=exclude_none, by_alias=by_alias, **kwargs)

    @is_like(pydantic.BaseModel.dict)  # pyright: ignore [reportDeprecated]
    def dict(self, *args: Any, **kwargs: Any) -> Any:
        raise NotImplementedError("deprecated")

    @is_like(pydantic.BaseModel.model_dump_json)
    def model_dump_json(self, *args: Any, **kwargs: Any) -> Any:
        exclude_none = kwargs.pop("exclude_none", True)
        by_alias = kwargs.pop("by_alias", True)
        return super().model_dump_json(*args, exclude_none=exclude_none, by_alias=by_alias, **kwargs)

    @is_like(pydantic.BaseModel.json)  # pyright: ignore [reportDeprecated]
    def json(self, *args: Any, **kwargs: Any) -> Any:
        raise NotImplementedError("deprecated")
