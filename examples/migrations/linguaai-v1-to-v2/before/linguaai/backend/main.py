import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from latitude_sdk import Latitude, LatitudeOptions

from routers import grammar, quiz

load_dotenv()

api_key = os.getenv("LATITUDE_API_KEY")
project_id = os.getenv("LATITUDE_PROJECT_ID")
version_uuid = os.getenv("LATITUDE_VERSION_UUID") or None

if not api_key:
    raise ValueError("LATITUDE_API_KEY is not set in .env")
if not project_id:
    raise ValueError("LATITUDE_PROJECT_ID is not set in .env")

sdk = Latitude(
    api_key,
    LatitudeOptions(
        project_id=int(project_id),
        version_uuid=version_uuid,
    ),
)

app = FastAPI(title="LinguaAI", description="Language learning API powered by Latitude")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(grammar.router)
app.include_router(quiz.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
