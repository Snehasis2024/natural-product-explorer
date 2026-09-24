"""COCONUT 2.0 adapter (https://coconut.naturalproducts.net/api-documentation).

The COCONUT REST API requires a personal access token (COCONUT_API_TOKEN). Endpoint shapes follow
the published documentation but were not exercised from the build environment; verify before use.
"""
from __future__ import annotations

from typing import Any

from .base import DatabaseAdapter, unified

BASE = "https://coconut.naturalproducts.net/api"


class CoconutAdapter(DatabaseAdapter):
    name = "COCONUT"
    homepage = "https://coconut.naturalproducts.net"
    api_docs = "https://coconut.naturalproducts.net/api-documentation"
    description = "COlleCtion of Open Natural prodUcTs: the largest open aggregated NP database."
    supports = ("coconut_id", "inchikey", "name")
    requires_key = True

    def __init__(self, timeout: float = 15.0, token: str | None = None):
        super().__init__(timeout)
        self.token = token

    def configured(self) -> bool:
        return bool(self.token)

    async def search(self, kind: str, value: str) -> list[dict[str, Any]]:
        if not self.token:
            return []
        field = {"coconut_id": "identifier", "inchikey": "standard_inchi_key", "name": "name"}[kind]
        body = {"search": {"filters": [{"field": field, "operator": "=", "value": value}]}}
        async with self.client(Authorization=f"Bearer {self.token}", Accept="application/json") as c:
            r = await c.post(f"{BASE}/compounds/search", json=body)
            r.raise_for_status()
        out = []
        for it in r.json().get("data", [])[:10]:
            ident = it.get("identifier")
            out.append(unified(
                source=self.name, database_id=ident, name=it.get("name"), smiles=it.get("canonical_smiles"),
                inchi=it.get("standard_inchi"), inchikey=it.get("standard_inchi_key"),
                source_url=f"https://coconut.naturalproducts.net/compounds/{ident}",
            ))
        return out
