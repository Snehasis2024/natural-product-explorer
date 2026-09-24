"""LOTUS adapter via the Wikidata Query Service (LOTUS data are curated in Wikidata).

Structure–organism pairs: InChIKey (P235) → "found in taxon" (P703) with the reference work
("stated in", P248) and its DOI (P356). See https://lotus.naturalproducts.net and Rutz et al., eLife 2022.
"""
from __future__ import annotations

from typing import Any

from .base import DatabaseAdapter, unified

SPARQL = "https://query.wikidata.org/sparql"

QUERY = """
SELECT ?compound ?compoundLabel ?smiles ?taxonName ?doi WHERE {
  ?compound wdt:P235 "%s" .
  OPTIONAL { ?compound wdt:P2017 ?smiles . }
  ?compound p:P703 ?stmt . ?stmt ps:P703 ?taxon . ?taxon wdt:P225 ?taxonName .
  OPTIONAL { ?stmt prov:wasDerivedFrom/pr:P248 ?ref . ?ref wdt:P356 ?doi . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 200
"""


class LotusAdapter(DatabaseAdapter):
    name = "LOTUS"
    homepage = "https://lotus.naturalproducts.net"
    api_docs = "https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service"
    description = "Open structure–organism pairs (LOTUS initiative), queried from Wikidata by InChIKey."
    supports = ("inchikey",)

    async def search(self, kind: str, value: str) -> list[dict[str, Any]]:
        async with self.client(Accept="application/sparql-results+json") as c:
            r = await c.get(SPARQL, params={"query": QUERY % value.upper(), "format": "json"})
            r.raise_for_status()
        rows = r.json()["results"]["bindings"]
        if not rows:
            return []
        qid = rows[0]["compound"]["value"].rsplit("/", 1)[-1]
        organisms = sorted({b["taxonName"]["value"] for b in rows})
        dois = sorted({b["doi"]["value"] for b in rows if "doi" in b})
        rec = unified(
            source=self.name, database_id=qid, name=rows[0].get("compoundLabel", {}).get("value"),
            smiles=rows[0].get("smiles", {}).get("value"), inchikey=value.upper(),
            organism="; ".join(organisms[:20]),
            literature=[{"doi": d, "title": None} for d in dois[:20]],
            source_url=f"https://www.wikidata.org/wiki/{qid}",
        )
        rec["organisms"] = organisms
        return [rec]
