from op_gepa_engine.util import Field, Model

ENGINE_MAX_TIME = 2 * 60 * 60
ENGINE_MAX_TOKENS = 100_000_000
ENGINE_MAX_STAGNATION = 10


class Budget(Model):
    time: int | None
    tokens: int | None


class Usage(Model):
    total: int = Field(alias=str("totalTokens"))
