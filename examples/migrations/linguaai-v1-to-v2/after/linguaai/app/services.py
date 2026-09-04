"""LinguaAI use cases: grammar check and vocab quiz.

Each function is one Latitude trace. `capture()` attaches the user, the session,
tags, and metadata to every span the Anthropic instrumentation creates inside it.
"""
import json
import re

from anthropic import Anthropic
from latitude_telemetry import capture

from app import prompts

client = Anthropic()


def _extract_json(text: str) -> dict:
    fenced = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    return json.loads((fenced.group(1) if fenced else text).strip())


def _complete(system: str, user: str, max_tokens: int) -> str:
    response = client.messages.create(
        model=prompts.MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return response.content[0].text


def check_grammar(text: str, language: str, *, user_id: str, session_id: str, tags: list[str] | None = None,
                  metadata: dict | None = None) -> dict:
    version, system = prompts.grammar_check_prompt(language)
    user = f"Language: {language}\nText: {text}"
    raw = capture(
        "grammar-check",
        lambda: _complete(system, user, max_tokens=600),
        {
            "user_id": user_id,
            "session_id": session_id,
            # Tags carry rollout labels (docs: tags for cohorts, metadata for exact values).
            # Experiments and session filters split on tags, so the release goes in both.
            "tags": ["grammar", f"release-{prompts.APP_RELEASE}", *(tags or ["production"])],
            "metadata": {
                "release": prompts.APP_RELEASE,
                "prompt_version": version,
                "language": language,
                **(metadata or {}),
            },
        },
    )
    data = _extract_json(raw)
    return {
        "corrections": data.get("corrections", []),
        "is_correct": data.get("is_correct", not data.get("corrections")),
        "summary": data.get("summary", ""),
    }


def generate_quiz(language: str, difficulty: str, topic: str | None, *, user_id: str, session_id: str) -> dict:
    version, system = prompts.vocab_quiz_prompt(language, difficulty, topic)
    user = f"Language: {language}\nDifficulty: {difficulty}" + (f"\nTopic: {topic}" if topic else "")
    raw = capture(
        "vocab-quiz",
        lambda: _complete(system, user, max_tokens=900),
        {
            "user_id": user_id,
            "session_id": session_id,
            "tags": ["quiz", f"release-{prompts.APP_RELEASE}", "production"],
            "metadata": {"release": prompts.APP_RELEASE, "prompt_version": version, "language": language},
        },
    )
    data = _extract_json(raw)
    return {"language": language, "difficulty": difficulty, "questions": data.get("questions", [])}
