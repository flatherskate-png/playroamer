from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import routes, health
from app.core.config import settings

app = FastAPI(
    title="Roamer API",
    version="0.1.0",
    description="Backend API for the Roamer geography puzzle game",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(routes.router, prefix="/api/v1", tags=["routes"])
