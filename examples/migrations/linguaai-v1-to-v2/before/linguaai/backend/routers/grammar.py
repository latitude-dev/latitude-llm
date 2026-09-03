import json
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from latitude_sdk import RunPromptOptions

router = APIRouter(prefix="/grammar", tags=["grammar"])


class GrammarCheckRequest(BaseModel):
    text: str
    language: str


class Correction(BaseModel):
    original: str
    corrected: str
    explanation: str


class GrammarCheckResponse(BaseModel):
    corrections: list[Correction]
    is_correct: bool
    summary: str


def _extract_json(text: str) -> dict:
    """Extract JSON from a response that may contain markdown fences."""
    fenced = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1).strip())
    return json.loads(text.strip())


@router.post("/check", response_model=GrammarCheckResponse)
async def check_grammar(req: GrammarCheckRequest):
    from main import sdk

    try:
        result = await sdk.prompts.run(
            "grammar-check",
            RunPromptOptions(
                parameters={
                    "text": req.text,
                    "language": req.language,
                },
            ),
        )

        response_text = result.response.text if hasattr(result.response, "text") else str(result.response)
        data = _extract_json(response_text)

        return GrammarCheckResponse(
            corrections=[Correction(**c) for c in data.get("corrections", [])],
            is_correct=data.get("is_correct", len(data.get("corrections", [])) == 0),
            summary=data.get("summary", ""),
        )
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Failed to parse AI response as JSON")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
