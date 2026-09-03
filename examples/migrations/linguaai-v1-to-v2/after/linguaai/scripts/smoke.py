"""Drive LinguaAI the way real learners do, so the V2 project has traffic to work with.

Run twice with different releases to give Experiments two cohorts:
    APP_RELEASE=2.0.0 python -m scripts.smoke
    APP_RELEASE=2.1.0 python -m scripts.smoke
"""
import json
import sys

from app import prompts, services
from app.telemetry import latitude

# (user, session, kind, payload). Sessions group turns of one study session.
LEARNERS = [
    ("usr_mara", "sess_mara_001", "grammar", {"text": "I have 25 years old and I live in Madrid since 2019.", "language": "English"}),
    ("usr_mara", "sess_mara_001", "grammar", {"text": "She don't like apples but she love pears.", "language": "English"}),
    ("usr_mara", "sess_mara_001", "quiz", {"language": "English", "difficulty": "intermediate", "topic": "travel"}),
    ("usr_kenji", "sess_kenji_001", "grammar", {"text": "Yo soy muy cansado hoy porque trabajé mucho.", "language": "Spanish"}),
    ("usr_kenji", "sess_kenji_001", "grammar", {"text": "Me gusta los perros y me gusta también los gatos.", "language": "Spanish"}),
    ("usr_lena", "sess_lena_001", "grammar", {"text": "Ich habe gestern nach Berlin gefahren.", "language": "German"}),
    ("usr_lena", "sess_lena_001", "quiz", {"language": "German", "difficulty": "beginner", "topic": "food"}),
    ("usr_mara", "sess_mara_002", "grammar", {"text": "If I would have known, I would have came earlier.", "language": "English"}),
    ("usr_mara", "sess_mara_002", "grammar", {"text": "Less people came to the party than we expected.", "language": "English"}),
    ("usr_mara", "sess_mara_002", "grammar", {"text": "The results were better than we expected.", "language": "English"}),
    ("usr_kenji", "sess_kenji_002", "grammar", {"text": "Ayer fui al cine con mis amigos y vimos una película muy buena.", "language": "Spanish"}),
    ("usr_kenji", "sess_kenji_002", "quiz", {"language": "Spanish", "difficulty": "advanced", "topic": "work"}),
]


def main() -> int:
    for user, base_session, kind, payload in LEARNERS:
        # A real session belongs to one release; suffix the id so cohorts stay clean.
        session = f"{base_session}-r{prompts.APP_RELEASE}"
        if kind == "grammar":
            out = services.check_grammar(payload["text"], payload["language"], user_id=user, session_id=session)
            verdict = "ok" if out["is_correct"] else f"{len(out['corrections'])} correction(s)"
            print(f"[{user}/{session}] grammar: {payload['text'][:45]!r} -> {verdict}")
        else:
            out = services.generate_quiz(payload["language"], payload["difficulty"], payload.get("topic"),
                                         user_id=user, session_id=session)
            print(f"[{user}/{session}] quiz: {payload['language']} {payload['difficulty']} -> {len(out['questions'])} questions")
    latitude.flush()
    latitude.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
