from typing import Optional, Union

from latitude_sdk.util import Model, StrEnum


# NOTE: Incomplete list
class ApiErrorCodes(StrEnum):
    # LatitudeErrorCodes
    NotFoundError = "NotFoundError"

    # RunErrorCodes
    AIRunError = "ai_run_error"

    # ApiErrorCodes
    HTTPException = "http_exception"
    InternalServerError = "internal_server_error"


UNEXPECTED_ERROR_CODES = [
    str(ApiErrorCodes.HTTPException),
    str(ApiErrorCodes.InternalServerError),
]


class ApiErrorDbRef(Model):
    entity_uuid: str
    entity_type: str


class ApiError(Exception):
    status: int
    code: str  # NOTE: Cannot be ApiErrorCodes because the list is incomplete
    message: str
    response: str
    db_ref: Optional[ApiErrorDbRef]

    def __init__(
        self,
        status: int,
        code: Union[str, ApiErrorCodes],
        message: str,
        response: str,
        db_ref: Optional[ApiErrorDbRef] = None,
    ):
        message = self._exception_message(status, str(code), message)
        super().__init__(message)

        self.status = status
        self.code = str(code)
        self.message = message
        self.response = response
        self.db_ref = db_ref

    @staticmethod
    def _exception_message(status: int, code: str, message: str) -> str:
        if code in UNEXPECTED_ERROR_CODES:
            return f"Unexpected API Error: {status} {message}"

        return message

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, ApiError)
            and self.status == other.status
            and self.code == other.code
            and self.message == other.message
            and self.response == other.response
            and self.db_ref == other.db_ref
        )
