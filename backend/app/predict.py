"""Natural-product class prediction.

Two interchangeable predictors share one response schema:

* ``NPCBertClient`` – calls an external NPC-BERT inference service at ``NPC_BERT_API_URL``.
* ``KnnBaselinePredictor`` – a transparent demo baseline: similarity-weighted k-nearest-neighbour
  voting over the curated reference set (Morgan r=2 / Tanimoto). It is *not* NPC-BERT; every
  response carries ``model.is_demo = true`` and the notice "Demo prediction — connect NPC-BERT API".
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from pathlib import Path
from typing import Any

import httpx
from rdkit import Chem

from . import chem
from .store import CompoundStore

log = logging.getLogger(__name__)

DEMO_NOTICE = "Demo prediction — connect NPC-BERT API"

# Descriptive structural features (SMARTS), shared with the browser engine via
# database/seed/np_features.json. They explain what the structure contains; they are not model
# weights. `pathways` lists the biosynthetic pathways each motif is typical of.
_FEATURES_PATH = Path(__file__).resolve().parents[2] / "database" / "seed" / "np_features.json"
FEATURES: list[tuple[str, str, list[str]]] = [
    (f["name"], f["smarts"], f["pathways"]) for f in json.loads(_FEATURES_PATH.read_text())["features"]
]
_FEATURE_PATTERNS = [(n, s, Chem.MolFromSmarts(s), p) for n, s, p in FEATURES]


def detect_features(mol: Chem.Mol) -> list[dict[str, Any]]:
    found = []
    for name, smarts, patt, pathways in _FEATURE_PATTERNS:
        if patt is None:
            continue
        matches = mol.GetSubstructMatches(patt)
        if matches:
            atoms = sorted({a for m in matches for a in m})
            found.append({"name": name, "smarts": smarts, "count": len(matches), "atoms": atoms, "associated_pathways": pathways})
    return found


class KnnBaselinePredictor:
    name = "Similarity-weighted kNN baseline"
    version = "1.0"

    def __init__(self, store: CompoundStore, k: int = 7):
        self.store = store
        self.k = k

    def predict(self, mol: Chem.Mol, smiles: str) -> dict[str, Any]:
        ids = chem.identifiers(mol)
        # Leave-one-out: the query itself is excluded so a reference compound cannot vote for itself.
        neighbours = self.store.nearest(mol, self.k, exclude_inchikey=ids["inchikey"])
        levels = ("pathway", "superclass", "class")
        scores: dict[str, dict[str, float]] = {lvl: defaultdict(float) for lvl in levels}
        total = 0.0
        for rec, sim in neighbours:
            w = max(sim, 1e-6) ** 2
            total += w
            for lvl in levels:
                scores[lvl][rec[lvl]] += w
        by_level = {
            lvl: [
                {"label": lab, "probability": round(v / total, 4), "level": lvl}
                for lab, v in sorted(scores[lvl].items(), key=lambda kv: -kv[1])[:5]
            ]
            for lvl in levels
        }
        max_sim = neighbours[0][1] if neighbours else 0.0
        return {
            "smiles": smiles,
            "canonical_smiles": ids["canonical_smiles"],
            "model": {
                "name": self.name,
                "version": self.version,
                "type": "demo-knn",
                "is_demo": True,
                "notice": DEMO_NOTICE,
                "reference_set_size": len(self.store.records),
            },
            **{lvl: {"label": by_level[lvl][0]["label"], "confidence": by_level[lvl][0]["probability"]} for lvl in levels},
            "top_k": by_level["class"],
            "top_k_by_level": by_level,
            "explanation": {
                "method": (
                    f"Votes of the {self.k} most similar reference compounds (Morgan r=2, 2048 bits, Tanimoto), "
                    "weighted by similarity². Probabilities are vote shares, not calibrated model probabilities. "
                    "The query itself is excluded (leave-one-out)."
                ),
                "nearest_neighbors": [
                    {"compound_id": r["compound_id"], "name": r["name"], "similarity": round(s, 4),
                     "pathway": r["pathway"], "superclass": r["superclass"], "class": r["class"], "smiles": r["canonical_smiles"]}
                    for r, s in neighbours
                ],
                "features": detect_features(mol),
                "features_note": "Structural motifs detected by SMARTS matching; descriptive only, not model weights.",
                "applicability_domain": {
                    "max_similarity": round(max_sim, 4),
                    "in_domain": max_sim >= 0.35,
                    "note": "Below 0.35 Tanimoto to every reference compound the vote is unreliable.",
                },
            },
        }


class NPCBertClient:
    """Adapter for an external NPC-BERT service.

    Expected request:  POST {NPC_BERT_API_URL}  {"smiles": "..."}
    Expected response: {"pathway": {"label", "confidence"}, "superclass": {...}, "class": {...},
                        "top_k": [{"label", "confidence"|"probability", "level"?}], "model_version"?: str}
    """

    def __init__(self, url: str, api_key: str | None, timeout: float):
        self.url = url
        self.api_key = api_key
        self.timeout = timeout

    async def predict(self, mol: Chem.Mol, smiles: str) -> dict[str, Any]:
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        ids = chem.identifiers(mol)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(self.url, json={"smiles": ids["canonical_smiles"]}, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        return self.normalise(data, smiles, ids["canonical_smiles"])

    @staticmethod
    def normalise(data: dict[str, Any], smiles: str, canonical: str) -> dict[str, Any]:
        def pred(key: str) -> dict[str, Any]:
            p = data.get(key) or {}
            if isinstance(p, list):  # some services return ranked lists per level
                p = p[0] if p else {}
            return {"label": str(p.get("label", "Unknown")), "confidence": float(p.get("confidence", p.get("probability", 0.0)))}

        top = []
        for item in data.get("top_k") or []:
            top.append({
                "label": str(item.get("label")),
                "probability": float(item.get("probability", item.get("confidence", 0.0))),
                "level": item.get("level", "class"),
            })
        by_level: dict[str, list[dict[str, Any]]] = {"pathway": [], "superclass": [], "class": []}
        for t in top:
            by_level.setdefault(t["level"], []).append(t)
        for lvl in ("pathway", "superclass", "class"):
            if not by_level[lvl]:
                p = pred(lvl)
                by_level[lvl] = [{"label": p["label"], "probability": p["confidence"], "level": lvl}]
        return {
            "smiles": smiles,
            "canonical_smiles": canonical,
            "model": {
                "name": "NPC-BERT",
                "version": str(data.get("model_version", "external")),
                "type": "npc-bert",
                "is_demo": False,
                "notice": "Prediction from the configured NPC-BERT inference service.",
                "reference_set_size": None,
            },
            "pathway": pred("pathway"),
            "superclass": pred("superclass"),
            "class": pred("class"),
            "top_k": [t for t in top if t["level"] == "class"] or by_level["class"],
            "top_k_by_level": by_level,
            "explanation": data.get("explanation") or {"note": "The NPC-BERT service returned no explanation."},
        }
