"""NPAtlas adapter (microbial natural products; https://www.npatlas.org/api/v1/docs).

Endpoint paths follow the public NPAtlas v1 API documentation. They could not be exercised from
the build environment (no outbound access), so verify against the live docs before relying on them.
"""
from __future__ import annotations

from typing import Any

from .base import DatabaseAdapter, unified

BASE = "https://www.npatlas.org/api/v1"


class NPAtlasAdapter(DatabaseAdapter):
    name = "NPAtlas"
    homepage = "https://www.npatlas.org"
    api_docs = "https://www.npatlas.org/api/v1/docs"
    description = "The Natural Products Atlas: curated microbially-derived natural products with literature."
    supports = ("npatlas_id", "inchikey", "name")

    async def search(self, kind: str, value: str) -> list[dict[str, Any]]:
        async with self.client() as c:
            if kind == "npatlas_id":
                r = await c.get(f"{BASE}/compound/{value.upper()}")
                items = [r.json()] if r.status_code == 200 else []
            else:
                field = {"inchikey": "inchikey", "name": "name"}[kind]
                r = await c.post(f"{BASE}/compounds/basicSearch", json={field: value}, params={"limit": 10})
                items = r.json() if r.status_code == 200 else []
        out = []
        for it in items if isinstance(items, list) else []:
            npaid = it.get("npaid")
            if not npaid:
                continue
            origin = it.get("origin_organism") or {}
            ref = it.get("origin_reference") or {}
            out.append(unified(
                source=self.name, database_id=npaid, name=it.get("original_name"), smiles=it.get("smiles"),
                inchi=it.get("inchi"), inchikey=it.get("inchikey"), formula=it.get("mol_formula"),
                molecular_weight=it.get("mol_weight"), exact_mass=it.get("exact_mass"),
                organism=" ".join(x for x in (origin.get("genus"), origin.get("species")) if x) or None,
                literature=[{"doi": ref.get("doi"), "title": ref.get("title")}] if ref else [],
                source_url=f"https://www.npatlas.org/explore/compounds/{npaid}",
            ))
        return out
