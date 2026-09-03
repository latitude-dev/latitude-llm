from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app import services

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


@router.post("/generate", response_model=QuizGenerateResponse)
def generate_quiz(
    req: QuizGenerateRequest,
    x_user_id: str = Header(default="anonymous"),
    x_session_id: str = Header(default="no-session"),
):
    try:
        return services.generate_quiz(
            req.language, req.difficulty, req.topic, user_id=x_user_id, session_id=x_session_id
        )
    except ValueError:
        raise HTTPException(status_code=502, detail="Failed to parse AI response as JSON")
