"""Common interface for external natural-product database adapters.

Adapters use only official, documented public APIs (no scraping). Each returns records mapped to
the unified internal schema with ``provenance = "database"``. They are disabled unless
ENABLE_REMOTE_ADAPTERS=true, so the app never depends on external availability.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

import httpx

log = logging.getLogger(__name__)

USER_AGENT = "NaturalProductExplorer/1.0 (+https://github.com/Snehasis2024/natural-product-explorer)"


def unified(
    *, source: str, database_id: str, name: str | None = None, smiles: str | None = None, inchi: str | None = None,
    inchikey: str | None = None, formula: str | None = None, molecular_weight: float | None = None,
    exact_mass: float | None = None, pathway: str | None = None, superclass: str | None = None,
    np_class: str | None = None, organism: str | None = None, literature: list[dict[str, Any]] | None = None,
    source_url: str | None = None,
) -> dict[str, Any]:
    """Map external data onto the unified schema. Missing values stay None (never guessed)."""
    return {
        "compound_id": f"{source.lower()}:{database_id}",
        "name": name, "smiles": smiles, "inchi": inchi, "inchikey": inchikey, "formula": formula,
        "molecular_weight": molecular_weight, "exact_mass": exact_mass,
        "pathway": pathway, "superclass": superclass, "class": np_class,
        "organism": organism, "database": source, "database_id": database_id,
        "literature": literature or [], "source_url": source_url, "provenance": "database",
    }


class DatabaseAdapter(ABC):
    name: str
    homepage: str
    api_docs: str
    description: str
    supports: tuple[str, ...]  # query kinds: name, pubchem_cid, inchikey, smiles, npatlas_id, coconut_id, chebi_id
    requires_key: bool = False

    def __init__(self, timeout: float = 15.0):
        self.timeout = timeout

    def client(self, **headers: str) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=self.timeout, headers={"User-Agent": USER_AGENT, **headers}, follow_redirects=True)

    def configured(self) -> bool:
        return True

    @abstractmethod
    async def search(self, kind: str, value: str) -> list[dict[str, Any]]:
        """Return unified records for a query of the given kind."""

    def info(self, enabled: bool) -> dict[str, Any]:
        return {
            "name": self.name, "homepage": self.homepage, "api_docs": self.api_docs, "description": self.description,
            "supports": list(self.supports), "requires_key": self.requires_key,
            "status": "enabled" if enabled and self.configured() else ("needs_credentials" if enabled else "disabled"),
        }
