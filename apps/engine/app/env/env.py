from app.util import Model, get_env


class Env(Model):
    NODE_ENV: str
    LATITUDE_CLOUD: bool
    ENGINE_SEED: int


env = Env(
    NODE_ENV=get_env("NODE_ENV", "development"),
    LATITUDE_CLOUD=get_env("LATITUDE_CLOUD", False),
    ENGINE_SEED=get_env("ENGINE_SEED", 310700),
)
