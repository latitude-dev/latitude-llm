import math

from op_gepa_engine.util import Field, Model

ENGINE_MAX_TIME = 60 * 60
ENGINE_MAX_TOKENS = 100_000_000
# Number of failure trajectories sampled per reflection round. Higher values
# give the proposer broader context per iteration at the cost of more input
# tokens; lower values run faster but see less of the failure surface.
ENGINE_DEFAULT_REFLECTION_MINIBATCH_SIZE = 5
# Number of iterations without improvement before giving up on optimization.
# Inversely scaled with the minibatch size: smaller minibatches see a noisier
# per-iteration validation delta and need more patience to recover from noise,
# while larger minibatches give a more representative signal so a flat stretch
# is a stronger exhaustion signal. Floored at 10 for very large minibatches.
ENGINE_MAX_STAGNATION = max(10, math.ceil(100 / ENGINE_DEFAULT_REFLECTION_MINIBATCH_SIZE))


class Budget(Model):
    time: int | None
    tokens: int | None
    stagnation: int | None


class Usage(Model):
    total: int = Field(alias=str("totalTokens"))
