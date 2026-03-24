from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import List
from pathlib import Path

# Absolute path to the backend/ directory, regardless of where uvicorn is invoked from
_BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env")

    environment: str = "development"
    allowed_origins: List[str] = ["http://localhost:3000", "https://roadtrip-game.vercel.app"]
    daily_route_index: int = 0
    routes_csv: Path = _BACKEND_DIR / "data" / "routes.csv"

    @property
    def cors_origins(self) -> List[str]:
        if self.environment == "development":
            return ["*"]
        return self.allowed_origins


settings = Settings()
