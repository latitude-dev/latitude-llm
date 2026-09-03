"""Latitude telemetry bootstrap.

Import this module before any Anthropic client is created. In V1 the Latitude
SDK sat between the app and the model (gateway); in V2 the model call is ours and
Latitude only observes it through OpenTelemetry.
"""
import os

import anthropic
from dotenv import load_dotenv
from latitude_telemetry import Latitude

load_dotenv()

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"anthropic": anthropic},
)
