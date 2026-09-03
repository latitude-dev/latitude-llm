import json
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from latitude_sdk import RunPromptOptions

router = APIRouter(prefix="/quiz", tags=["quiz"])


class QuizGenerateRequest(BaseModel):
    language: str
    difficulty: str = "intermediate"
    topic: str | None = None


class QuizOption(BaseModel):
    label: str
    value: str


class QuizQuestion(BaseModel):
    question: str
    options: list[QuizOption]
    correct_answer: str
    explanation: str


class QuizGenerateResponse(BaseModel):
    language: str
    difficulty: str
    questions: list[QuizQuestion]


def _extract_json(text: str) -> dict:
    """Extract JSON from a response that may contain markdown fences."""
    fenced = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1).strip())
    return json.loads(text.strip())


@router.post("/generate", response_model=QuizGenerateResponse)
async def generate_quiz(req: QuizGenerateRequest):
    from main import sdk

    try:
        parameters = {
            "language": req.language,
            "difficulty": req.difficulty,
        }
        if req.topic:
            parameters["topic"] = req.topic

        result = await sdk.prompts.run(
            "vocab-quiz",
            RunPromptOptions(parameters=parameters),
        )

        response_text = result.response.text if hasattr(result.response, "text") else str(result.response)
        data = _extract_json(response_text)

        questions = []
        for q in data.get("questions", []):
            options = []
            for opt in q.get("options", []):
                if isinstance(opt, dict):
                    options.append(QuizOption(**opt))
                else:
                    options.append(QuizOption(label=str(opt), value=str(opt)))
            questions.append(
                QuizQuestion(
                    question=q["question"],
                    options=options,
                    correct_answer=q["correct_answer"],
                    explanation=q.get("explanation", ""),
                )
            )

        return QuizGenerateResponse(
            language=req.language,
            difficulty=req.difficulty,
            questions=questions,
        )
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Failed to parse AI response as JSON")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
