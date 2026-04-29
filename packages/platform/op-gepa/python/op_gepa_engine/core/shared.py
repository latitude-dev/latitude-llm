from op_gepa_engine.util import Field, Model

ENGINE_MAX_TIME = 2 * 60 * 60
ENGINE_MAX_TOKENS = 100_000_000
# Number of iterations without improvement before giving up on optimization
ENGINE_MAX_STAGNATION = 10
# Number of failure trajectories sampled per reflection round. Higher values
# give the proposer broader context per iteration at the cost of more input
# tokens; lower values run faster but see less of the failure surface.
ENGINE_DEFAULT_REFLECTION_MINIBATCH_SIZE = 5


class Budget(Model):
    time: int | None
    tokens: int | None
    stagnation: int | None


class Usage(Model):
    total: int = Field(alias=str("totalTokens"))
