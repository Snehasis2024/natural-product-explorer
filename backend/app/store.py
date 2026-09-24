"""Compound repository.

Records are loaded once (from PostgreSQL when DATABASE_URL is set, otherwise from the seed JSON)
and indexed in memory for text search, filtering and RDKit substructure search.
Similarity search runs in PostgreSQL with pgvector's Jaccard distance on bit(2048) fingerprints
when the database is available (1 − Jaccard distance = Tanimoto), otherwise in-process with
FAISS (binary index, candidate generation) + exact RDKit Tanimoto re-ranking.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
from rdkit import Chem, DataStructs
from rdkit.Chem import rdSubstructLibrary

from . import chem

log = logging.getLogger(__name__)

try:  # optional accelerator
    import faiss  # type: ignore
except ImportError:  # pragma: no cover
    faiss = None


class CompoundStore:
    def __init__(self, records: list[dict[str, Any]], meta: dict[str, Any] | None = None, backend: str = "json"):
        self.meta = meta or {}
        self.backend = backend
        self.db = None  # set by attach_database
        self.records = records
        self.by_id = {r["compound_id"].lower(): r for r in records}
        self.by_inchikey = {r["inchikey"]: r for r in records}
        self.by_external: dict[tuple[str, str], dict[str, Any]] = {}
        for r in records:
            for key, val in (r.get("external_ids") or {}).items():
                if val:
                    self.by_external[(key, str(val).upper())] = r
        self.fps = [chem.morgan_fp(Chem.MolFromSmiles(r["canonical_smiles"])) for r in records]
        self._sslib = self._build_substruct_library(records)
        self._faiss = self._build_faiss(self.fps)

    # ---------- construction ----------
    @classmethod
    def from_json(cls, path: Path) -> "CompoundStore":
        data = json.loads(Path(path).read_text())
        log.info("Loaded %d compounds from %s", len(data["compounds"]), path)
        return cls(data["compounds"], data.get("meta"), backend="json")

    @staticmethod
    def _build_substruct_library(records: list[dict[str, Any]]):
        mols = rdSubstructLibrary.CachedTrustedSmilesMolHolder()
        patterns = rdSubstructLibrary.PatternHolder()
        for r in records:
            m = Chem.MolFromSmiles(r["canonical_smiles"])
            mols.AddSmiles(Chem.MolToSmiles(m))
            patterns.AddFingerprint(Chem.PatternFingerprint(m))
        return rdSubstructLibrary.SubstructLibrary(mols, patterns)

    @staticmethod
    def _build_faiss(fps: list[DataStructs.ExplicitBitVect]):
        if faiss is None or not fps:
            return None
        packed = np.vstack([np.packbits(np.array(list(fp), dtype=np.uint8)) for fp in fps])
        index = faiss.IndexBinaryFlat(chem.FP_BITS)
        index.add(packed)
        return index

    # ---------- lookups ----------
    def get(self, compound_id: str) -> dict[str, Any] | None:
        return self.by_id.get(compound_id.lower())

    def get_by_inchikey(self, inchikey: str) -> dict[str, Any] | None:
        return self.by_inchikey.get(inchikey.upper())

    def get_by_external(self, kind: str, value: str) -> dict[str, Any] | None:
        return self.by_external.get((kind, value.upper()))

    # ---------- structure search ----------
    def exact(self, mol: Chem.Mol) -> dict[str, Any] | None:
        return self.get_by_inchikey(chem.identifiers(mol)["inchikey"])

    def substructure(self, pattern: Chem.Mol, limit: int = 50) -> list[tuple[dict[str, Any], list[int]]]:
        idxs = list(self._sslib.GetMatches(pattern, maxResults=limit, numThreads=1))
        out = []
        for i in idxs:
            rec = self.records[i]
            m = Chem.MolFromSmiles(rec["canonical_smiles"])
            out.append((rec, list(m.GetSubstructMatch(pattern))))
        return out

    def similarity(self, mol: Chem.Mol, threshold: float, limit: int) -> tuple[list[tuple[dict[str, Any], float]], str]:
        qfp = chem.morgan_fp(mol)
        if self.db is not None:
            try:
                return self.db.similarity(qfp.ToBitString(), threshold, limit, self), "pgvector (PostgreSQL, Jaccard on bit(2048))"
            except Exception as exc:  # noqa: BLE001 - fall back to in-process search
                log.warning("pgvector similarity failed, falling back to in-memory: %s", exc)
        candidates = range(len(self.records))
        method = "RDKit BulkTanimoto (exact)"
        if self._faiss is not None and len(self.records) > 5000:
            # Hamming-distance candidate generation, then exact Tanimoto re-ranking.
            k = min(len(self.records), max(limit * 20, 500))
            q = np.packbits(np.array(list(qfp), dtype=np.uint8))[None, :]
            _, idx = self._faiss.search(q, k)
            candidates = [int(i) for i in idx[0] if i >= 0]
            method = "FAISS binary index + RDKit Tanimoto re-rank"
        cand = list(candidates)
        sims = DataStructs.BulkTanimotoSimilarity(qfp, [self.fps[i] for i in cand])
        hits = sorted(((self.records[i], s) for i, s in zip(cand, sims) if s >= threshold), key=lambda t: -t[1])
        return hits[:limit], method

    def nearest(self, mol: Chem.Mol, k: int, exclude_inchikey: str | None = None) -> list[tuple[dict[str, Any], float]]:
        sims = DataStructs.BulkTanimotoSimilarity(chem.morgan_fp(mol), self.fps)
        ranked = sorted(zip(self.records, sims), key=lambda t: -t[1])
        return [(r, s) for r, s in ranked if r["inchikey"] != exclude_inchikey][:k]

    # ---------- text search & facets ----------
    NUMERIC = {"molecular_weight", "logp", "tpsa", "hbd", "hba", "rings", "rotatable_bonds", "qed"}

    @staticmethod
    def value(rec: dict[str, Any], key: str) -> Any:
        if key in ("molecular_weight", "exact_mass", "formula", "name", "pathway", "superclass", "class", "database", "compound_id"):
            return rec.get(key)
        if key == "organism":
            return (rec.get("organism") or {}).get("name") or ""
        if key == "kingdom":
            return (rec.get("organism") or {}).get("kingdom") or ""
        return rec["properties"].get(key)

    def text_match(self, rec: dict[str, Any], q: str) -> int:
        """Relevance score (0 = no match)."""
        ql = q.lower()
        name = rec["name"].lower()
        if name == ql or rec["compound_id"].lower() == ql:
            return 100
        if name.startswith(ql):
            return 80
        if ql in name:
            return 60
        org = rec.get("organism") or {}
        hay = " ".join(
            str(x)
            for x in (
                rec["pathway"], rec["superclass"], rec["class"], rec["formula"], rec.get("description") or "",
                org.get("name"), org.get("family"), org.get("genus"), org.get("kingdom"),
            )
            if x
        ).lower()
        return 30 if ql in hay else 0

    def filter(self, items: list[dict[str, Any]], filters: dict[str, Any]) -> list[dict[str, Any]]:
        out = items
        for key in ("pathway", "superclass", "class", "database", "kingdom"):
            vals = filters.get(key)
            if vals:
                allowed = {v.lower() for v in vals}
                out = [r for r in out if str(self.value(r, key)).lower() in allowed]
        if filters.get("organism"):
            o = filters["organism"].lower()
            out = [r for r in out if o in str(self.value(r, "organism")).lower()]
        for key in ("molecular_weight", "logp", "tpsa"):
            lo, hi = filters.get(f"{key}_min"), filters.get(f"{key}_max")
            if lo is not None:
                out = [r for r in out if self.value(r, key) >= lo]
            if hi is not None:
                out = [r for r in out if self.value(r, key) <= hi]
        return out

    def facets(self, items: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
        result: dict[str, dict[str, int]] = {}
        for key in ("pathway", "superclass", "class", "database", "kingdom"):
            counts: dict[str, int] = {}
            for r in items:
                v = self.value(r, key)
                if v:
                    counts[v] = counts.get(v, 0) + 1
            result[key] = dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))
        return result
