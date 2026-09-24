from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime configuration. All secrets come from the environment / .env, never from the frontend."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Natural Product Explorer API"
    environment: str = "development"
    log_level: str = "INFO"

    # Data
    database_url: str | None = Field(default=None, description="postgresql+psycopg://user:pass@host:5432/db")
    seed_path: Path = REPO_ROOT / "database" / "seed" / "compounds.json"
    ontology_path: Path = REPO_ROOT / "database" / "seed" / "ontology.json"
    conformer_dir: Path = REPO_ROOT / "database" / "seed" / "conformers"

    # NPC-BERT (external inference service)
    npc_bert_api_url: str | None = None
    npc_bert_api_key: str | None = None
    npc_bert_timeout_seconds: float = 20.0

    # External databases (official APIs only)
    enable_remote_adapters: bool = False
    pubchem_api_key: str | None = None
    coconut_api_token: str | None = None
    http_timeout_seconds: float = 15.0

    # Caching / protection
    redis_url: str | None = None
    cache_ttl_seconds: int = 3600
    cors_origins: str = "http://localhost:5173,http://localhost:8080,http://127.0.0.1:5173"
    rate_limit_per_minute: int = 120
    max_request_bytes: int = 256 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
