"""ChEBI adapter via the EBI Ontology Lookup Service (OLS4) REST API."""
from __future__ import annotations

from typing import Any

from .base import DatabaseAdapter, unified

OLS = "https://www.ebi.ac.uk/ols4/api/search"


class ChebiAdapter(DatabaseAdapter):
    name = "ChEBI"
    homepage = "https://www.ebi.ac.uk/chebi/"
    api_docs = "https://www.ebi.ac.uk/ols4/help"
    description = "Chemical Entities of Biological Interest (EMBL-EBI), searched through OLS4."
    supports = ("name", "chebi_id", "inchikey")

    async def search(self, kind: str, value: str) -> list[dict[str, Any]]:
        params = {"q": value, "ontology": "chebi", "rows": 10}
        if kind == "chebi_id":
            params.update({"queryFields": "obo_id", "exact": "true"})
        async with self.client() as c:
            r = await c.get(OLS, params=params)
            r.raise_for_status()
        out = []
        for d in r.json().get("response", {}).get("docs", []):
            obo = d.get("obo_id")
            if not obo or not obo.startswith("CHEBI:"):
                continue
            out.append(unified(
                source=self.name, database_id=obo, name=d.get("label"),
                source_url=f"https://www.ebi.ac.uk/chebi/searchId.do?chebiId={obo}",
            ))
        return out
