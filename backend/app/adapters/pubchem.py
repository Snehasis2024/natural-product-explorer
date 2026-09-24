"""PubChem PUG REST adapter (https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest)."""
from __future__ import annotations

from typing import Any
from urllib.parse import quote

from .base import DatabaseAdapter, unified

BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
PROPS = "Title,SMILES,IsomericSMILES,InChI,InChIKey,MolecularFormula,MolecularWeight,ExactMass"


class PubChemAdapter(DatabaseAdapter):
    name = "PubChem"
    homepage = "https://pubchem.ncbi.nlm.nih.gov"
    api_docs = "https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest"
    description = "NCBI open chemistry database. Queried through the PUG REST API (max 5 requests/s)."
    supports = ("name", "pubchem_cid", "inchikey", "smiles", "inchi")

    async def search(self, kind: str, value: str) -> list[dict[str, Any]]:
        async with self.client() as c:
            if kind in ("smiles", "inchi"):
                r = await c.post(f"{BASE}/compound/{kind}/property/{PROPS}/JSON", data={kind: value})
            else:
                ns = {"name": "name", "pubchem_cid": "cid", "inchikey": "inchikey"}[kind]
                r = await c.get(f"{BASE}/compound/{ns}/{quote(value, safe='')}/property/{PROPS}/JSON")
            if r.status_code == 404:
                return []
            r.raise_for_status()
        out = []
        for p in r.json().get("PropertyTable", {}).get("Properties", [])[:10]:
            cid = str(p["CID"])
            out.append(unified(
                source=self.name, database_id=cid, name=p.get("Title"),
                smiles=p.get("SMILES") or p.get("IsomericSMILES"), inchi=p.get("InChI"), inchikey=p.get("InChIKey"),
                formula=p.get("MolecularFormula"),
                molecular_weight=float(p["MolecularWeight"]) if p.get("MolecularWeight") else None,
                exact_mass=float(p["ExactMass"]) if p.get("ExactMass") else None,
                source_url=f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
            ))
        return out
