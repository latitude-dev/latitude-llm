"""Prompts live in the codebase now.

These were PromptL documents in the Latitude V1 prompt manager (`grammar-check`,
`vocab-quiz`). The PromptL frontmatter (provider/model/temperature) became plain
arguments to the provider call; `{{ variables }}` became Python string formatting.
Version them with your code: the version string travels to Latitude as metadata,
so traces and experiments can be sliced per prompt version.
"""
import os

APP_RELEASE = os.environ.get("APP_RELEASE", "2.1.0")

MODEL = "claude-haiku-4-5-20251001"

GRAMMAR_CHECK_V2 = """You are LinguaAI's grammar coach. The learner is studying {language}.
Check the learner's text for grammar errors.
Reply ONLY with JSON of this shape:
{{"corrections": [{{"original": "...", "corrected": "...", "explanation": "..."}}],
 "is_correct": true|false,
 "summary": "one encouraging sentence"}}
If the text has no errors, return an empty corrections list and is_correct true."""

GRAMMAR_CHECK_V3 = """You are LinguaAI's grammar coach. The learner is studying {language}.
Check the learner's text for grammar, agreement, tense, and word-choice errors.
Be strict: a sentence is only correct if a careful teacher would accept it as written.
For every correction name the rule involved in the explanation.
Reply ONLY with JSON of this shape:
{{"corrections": [{{"original": "...", "corrected": "...", "explanation": "..."}}],
 "is_correct": true|false,
 "summary": "one encouraging sentence"}}
If the text has no errors, return an empty corrections list and is_correct true."""

# Release 2.0.0 shipped the V1 prompt as-is; 2.1.0 tightened it after the
# "missed error" signal. Experiments compare the two by metadata.release.
GRAMMAR_CHECK_VERSIONS = {
    "2.0.0": ("grammar-check@2", GRAMMAR_CHECK_V2),
    "2.1.0": ("grammar-check@3", GRAMMAR_CHECK_V3),
}


def grammar_check_prompt(language: str) -> tuple[str, str]:
    """Return (prompt_version, system_prompt) for the current release."""
    version, template = GRAMMAR_CHECK_VERSIONS.get(APP_RELEASE, GRAMMAR_CHECK_VERSIONS["2.1.0"])
    return version, template.format(language=language)


VOCAB_QUIZ_VERSION = "vocab-quiz@1"
VOCAB_QUIZ_SYSTEM = """You are LinguaAI's quiz writer. Write a {difficulty} vocabulary quiz for a learner of {language}{topic_clause}.
Write exactly 3 multiple-choice questions. Reply ONLY with JSON:
{{"questions": [{{"question": "...", "options": [{{"label": "A", "value": "..."}}, {{"label": "B", "value": "..."}}, {{"label": "C", "value": "..."}}, {{"label": "D", "value": "..."}}], "correct_answer": "A", "explanation": "..."}}]}}"""


def vocab_quiz_prompt(language: str, difficulty: str, topic: str | None) -> tuple[str, str]:
    topic_clause = f" about {topic}" if topic else ""
    return VOCAB_QUIZ_VERSION, VOCAB_QUIZ_SYSTEM.format(
        language=language, difficulty=difficulty, topic_clause=topic_clause
    )
