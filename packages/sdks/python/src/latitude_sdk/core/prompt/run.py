from typing import Any, Dict, Optional

from latitude_sdk.core.client import Client
from latitude_sdk.core.common import EventCallbacks, PromptOptions
from latitude_sdk.util import BaseModel


class RunPromptOptions(EventCallbacks, PromptOptions, BaseModel):
    custom_identifier: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    stream: Optional[bool] = None


# TODO
class RunPromptResult(BaseModel):
    pass


class RunPrompt:
    client: Client

    def __init__(self, client: Client):
        self.client = client

    def run(self, path: str, options: RunPromptOptions) -> RunPromptResult:
        # TODO
        return None
