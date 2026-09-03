from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.telemetry import latitude  # first import: telemetry before the model client
from app.routers import grammar, quiz


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    latitude.flush()
    latitude.shutdown()


app = FastAPI(title="LinguaAI", description="Language learning API, traced with Latitude", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(grammar.router)
app.include_router(quiz.router)


@app.get("/health")
def health():
    return {"status": "ok"}
