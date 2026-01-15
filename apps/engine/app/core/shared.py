from app.util import Field, Model

ENGINE_MAX_TIME = 2 * 60 * 60  # 2 hours
ENGINE_MAX_TOKENS = 100_000_000  # 100M tokens
ENGINE_MAX_STAGNATION = 10  # 10 iterations without improvement

ENGINE_SCORE_SCALE = 1  # Note: most algorithms use floats with a scale of [0,1]


class Usage(Model):
    prompt: int = Field(alias=str("promptTokens"))
    cached: int = Field(alias=str("cachedInputTokens"))
    reasoning: int = Field(alias=str("reasoningTokens"))
    completion: int = Field(alias=str("completionTokens"))
    total: int = Field(alias=str("totalTokens"))


class Budget(Model):
    time: int | None  # seconds
    tokens: int | None
