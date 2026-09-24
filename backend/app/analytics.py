"""Dataset statistics, chemical-space projections and the classification hierarchy."""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any, Iterable

import numpy as np
from rdkit import Chem

from . import chem


def _histogram(values: list[float], bins: int, lo: float | None = None, hi: float | None = None) -> list[dict[str, Any]]:
    if not values:
        return []
    arr = np.asarray(values, dtype=float)
    counts, edges = np.histogram(arr, bins=bins, range=(lo if lo is not None else arr.min(), hi if hi is not None else arr.max()))
    return [
        {"bin_start": round(float(edges[i]), 2), "bin_end": round(float(edges[i + 1]), 2), "count": int(c)}
        for i, c in enumerate(counts)
    ]


def _fingerprint_matrix(records: list[dict[str, Any]]) -> np.ndarray:
    rows = []
    for r in records:
        fp = chem.morgan_fp(Chem.MolFromSmiles(r["canonical_smiles"]))
        arr = np.zeros((chem.FP_BITS,), dtype=np.float32)
        on = list(fp.GetOnBits())
        arr[on] = 1.0
        rows.append(arr)
    return np.vstack(rows)


def pca_2d(x: np.ndarray) -> tuple[np.ndarray, list[float]]:
    centred = x - x.mean(axis=0)
    u, s, _ = np.linalg.svd(centred, full_matrices=False)
    coords = u[:, :2] * s[:2]
    var = (s**2) / max(float((s**2).sum()), 1e-12)
    return coords, [round(float(v), 4) for v in var[:2]]


def tsne_2d(x: np.ndarray, seed: int = 42) -> np.ndarray | None:
    try:
        from sklearn.manifold import TSNE
    except ImportError:  # pragma: no cover
        return None
    n = x.shape[0]
    if n < 5:
        return None
    perplexity = float(min(30, max(5, (n - 1) // 4)))
    return TSNE(n_components=2, perplexity=perplexity, metric="jaccard", init="random", random_state=seed).fit_transform(x.astype(bool))


def compute_statistics(records: list[dict[str, Any]]) -> dict[str, Any]:
    def count(key: str) -> list[dict[str, Any]]:
        return [{"label": k, "count": v} for k, v in Counter(r[key] for r in records if r.get(key)).most_common()]

    props = [r["properties"] for r in records]
    x = _fingerprint_matrix(records) if records else np.zeros((0, chem.FP_BITS))
    pca, var = pca_2d(x) if len(records) >= 3 else (np.zeros((len(records), 2)), [0.0, 0.0])
    tsne = tsne_2d(x)
    points = []
    for i, r in enumerate(records):
        p = {
            "compound_id": r["compound_id"],
            "name": r["name"],
            "smiles": r["canonical_smiles"],
            "pathway": r["pathway"],
            "superclass": r["superclass"],
            "class": r["class"],
            "molecular_weight": r["molecular_weight"],
            "pca": [round(float(pca[i, 0]), 4), round(float(pca[i, 1]), 4)],
        }
        if tsne is not None:
            p["tsne"] = [round(float(tsne[i, 0]), 4), round(float(tsne[i, 1]), 4)]
        points.append(p)
    kingdoms = Counter((r.get("organism") or {}).get("kingdom") for r in records)
    return {
        "total_compounds": len(records),
        "pathway_distribution": count("pathway"),
        "superclass_distribution": count("superclass"),
        "class_distribution": count("class"),
        "kingdom_distribution": [{"label": k, "count": v} for k, v in kingdoms.most_common() if k],
        "molecular_weight_histogram": _histogram([p["molecular_weight"] for p in props], 12),
        "logp_histogram": _histogram([p["logp"] for p in props], 12),
        "tpsa_histogram": _histogram([p["tpsa"] for p in props], 12),
        "chemical_space": {
            "fingerprint": f"Morgan r={chem.FP_RADIUS}, {chem.FP_BITS} bits",
            "methods": ["pca"] + (["tsne"] if tsne is not None else []),
            "pca_explained_variance": var,
            "points": points,
        },
        "provenance": "calculated",
    }


def build_ontology(records: Iterable[dict[str, Any]], ontology: dict[str, Any]) -> dict[str, Any]:
    tree: dict[str, dict[str, dict[str, list[dict[str, Any]]]]] = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for r in records:
        tree[r["pathway"]][r["superclass"]][r["class"]].append(r)

    def cls_node(name: str, members: list[dict[str, Any]], pathway: str) -> dict[str, Any]:
        organisms = sorted({(m.get("organism") or {}).get("name") for m in members} - {None})
        return {
            "name": name,
            "level": "class",
            "count": len(members),
            "description": ontology["classes"].get(name),
            "representatives": [
                {"compound_id": m["compound_id"], "name": m["name"], "smiles": m["canonical_smiles"]} for m in members[:6]
            ],
            "organisms": organisms,
            "related_pathways": [pathway],
        }

    pathways = []
    for pw in sorted(tree, key=lambda k: -sum(len(c) for s in tree[k].values() for c in s.values())):
        meta = ontology["pathways"].get(pw, {})
        supers = []
        for sc in sorted(tree[pw]):
            classes = [cls_node(c, m, pw) for c, m in sorted(tree[pw][sc].items())]
            supers.append({
                "name": sc,
                "level": "superclass",
                "count": sum(c["count"] for c in classes),
                "description": ontology["superclasses"].get(sc),
                "children": classes,
            })
        pathways.append({
            "name": pw,
            "level": "pathway",
            "count": sum(s["count"] for s in supers),
            "description": meta.get("description"),
            "precursors": meta.get("precursors", []),
            "children": supers,
        })
    return {"provenance": ontology.get("_provenance"), "pathways": pathways}
