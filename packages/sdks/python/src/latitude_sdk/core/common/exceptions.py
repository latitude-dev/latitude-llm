from typing import Union

from latitude_sdk.util import StrEnum


# NOTE: Incomplete list
class LatitudeErrorCodes(StrEnum):
    pass


# NOTE: Incomplete list
class RunErrorCodes(StrEnum):
    pass


# NOTE: Incomplete list
class HttpErrorCodes(StrEnum):
    HTTP_EXCEPTION = "http_exception"
    INTERNAL_SERVER_ERROR = "internal_server_error"


ApiErrorCodes = Union[HttpErrorCodes, RunErrorCodes, LatitudeErrorCodes]


class LatitudeException(Exception):
    status: int
    code: ApiErrorCodes
    message: str

    def __init__(self, status: int, code: ApiErrorCodes, message: str):
        message = self._exception_message(status, code, message)
        super().__init__(message)

        self.status = status
        self.code = code
        self.message = message

    @staticmethod
    def _exception_message(status: int, code: ApiErrorCodes, message: str) -> str:
        if code in [
            HttpErrorCodes.HTTP_EXCEPTION,
            HttpErrorCodes.INTERNAL_SERVER_ERROR,
        ]:
            return f"Unexpected API Error: {status} {message}"

        return message
