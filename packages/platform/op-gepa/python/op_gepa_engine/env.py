from op_gepa_engine.util import Model, get_env


class Env(Model):
    NODE_ENV: str
    LAT_GEPA_SEED: int


env = Env(
    NODE_ENV=get_env("NODE_ENV", "development"),
    LAT_GEPA_SEED=get_env("LAT_GEPA_SEED", 310700),
)
