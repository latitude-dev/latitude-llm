from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app import services

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


@router.post("/check", response_model=GrammarCheckResponse)
def check_grammar(
    req: GrammarCheckRequest,
    # Demo only: these headers are trusted as-is. A real deployment must derive
    # user_id/session_id from an authenticated session, not a client-set header.
    x_user_id: str = Header(default="anonymous"),
    x_session_id: str = Header(default="no-session"),
):
    # Sync route on purpose: FastAPI runs it in a worker thread, and capture()
    # must wrap the model call in the same thread.
    try:
        return services.check_grammar(req.text, req.language, user_id=x_user_id, session_id=x_session_id)
    except ValueError:
        raise HTTPException(status_code=502, detail="Failed to parse AI response as JSON")
