from enum import Enum
from typing import Any, Callable, List, TypeVar

import pydantic
from typing_extensions import ParamSpec

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
    def list(cls) -> List[str]:
        return [v.value for v in cls]


class BaseModel(pydantic.BaseModel):
    @is_like(pydantic.BaseModel.__iter__)
    def __iter__(self) -> Any:
        yield from [(k, v) for k, v in super().__iter__() if k in self.__pydantic_fields_set__]

    @is_like(pydantic.BaseModel.model_dump)
    def model_dump(self, *args: Any, **kwargs: Any) -> Any:
        exclude_unset = kwargs.pop("exclude_unset", True)
        return super().model_dump(*args, exclude_unset=exclude_unset, **kwargs)

    @is_like(pydantic.BaseModel.dict)  # pyright: ignore [reportDeprecated]
    def dict(self, *args: Any, **kwargs: Any) -> Any:
        exclude_unset = kwargs.pop("exclude_unset", True)
        return super().dict(*args, exclude_unset=exclude_unset, **kwargs)  # pyright: ignore [reportDeprecated]

    @is_like(pydantic.BaseModel.model_dump_json)
    def model_dump_json(self, *args: Any, **kwargs: Any) -> Any:
        exclude_unset = kwargs.pop("exclude_unset", True)
        return super().model_dump_json(*args, exclude_unset=exclude_unset, **kwargs)

    @is_like(pydantic.BaseModel.json)  # pyright: ignore [reportDeprecated]
    def json(self, *args: Any, **kwargs: Any) -> Any:
        exclude_unset = kwargs.pop("exclude_unset", True)
        return super().json(*args, exclude_unset=exclude_unset, **kwargs)  # pyright: ignore [reportDeprecated]
