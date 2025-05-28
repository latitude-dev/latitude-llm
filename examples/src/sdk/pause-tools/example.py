import asyncio
import os
from devtools import pprint
from typing import Optional, Dict, Any

from latitude_sdk import (
    Latitude,
    LatitudeOptions,
    RunPromptOptions,
    OnToolCallDetails,
)
from promptl_ai import ToolMessage, ToolResultContent


ItineraryRequested = Dict[str, Any]
tool_requested: Optional[ItineraryRequested] = None


def enqueue_job_to_process_itinerary(itinerary: ItineraryRequested):
    global tool_requested
    tool_requested = itinerary


def compute_travel_itinerary(itinerary: ItineraryRequested) -> Dict[str, Any]:
    data = itinerary["data"]
    return {
        "location": data["location"],
        "start_date": data["start_date"],
        "end_date": data["end_date"],
        "preferences": data.get("preferences"),
        "recommendations": [
            "Visit the Sagrada Familia",
            "Explore Park Güell",
            "Take a stroll down La Rambla",
            "Relax at Barceloneta Beach",
            "Enjoy tapas at a local restaurant",
            "Visit the Picasso Museum",
        ],
    }


async def generate_travel_itinerary(arguments: dict[str, Any], details: OnToolCallDetails) -> str:
    pprint(details)
    enqueue_job_to_process_itinerary(
        {
            "data": {
                "location": arguments.get("location", "Barcelona"),
                "start_date": arguments.get("start_date"),
                "end_date": arguments.get("end_date"),
                "preferences": arguments.get("preferences"),
            },
            "tool_id": details.id,
            "tool_name": details.name,
            "conversationUuid": details.conversation_uuid,
        }
    )

    return details.pause_execution()


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        version_uuid="live",
    )

    sdk = Latitude(api_key, sdk_options)
    await sdk.prompts.run(
        "pause-tools/example",
        RunPromptOptions(
            parameters={
                "destination": "Barcelona",
                "start_date": "2025-06-02",
                "end_date": "2025-06-10",
                "preferences": "museums, parks, and local cuisine",
            },
            tools={"generate_travel_itinerary": generate_travel_itinerary},
        ),
    )

    if tool_requested is None:
        print("No tool requested.")
        return

    # Imagine this is your backend processing the job asynchronously.
    result = await sdk.prompts.chat(
        tool_requested["conversationUuid"],
        [
            ToolMessage(
                content=[
                    ToolResultContent(
                        id=tool_requested["tool_id"],
                        name=tool_requested["tool_name"],
                        result=compute_travel_itinerary(tool_requested),
                        is_error=False,
                    ),
                ],
            )
        ],
    )

    pprint(result.response.text)


asyncio.run(run())
