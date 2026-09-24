"""Natural Product Explorer – FastAPI application."""
from __future__ import annotations

import json
import logging
import math
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from rdkit import Chem
from starlette.concurrency import run_in_threadpool

from . import analytics, chem
from .adapters import build_adapters, federated_search
from .config import get_settings
from .middleware import AccessLogMiddleware, BodySizeLimitMiddleware, Cache, RateLimitMiddleware
from .predict import KnnBaselinePredictor, NPCBertClient, detect_features
from .schemas import CompareIn, PredictOut, SimilarityIn, SmilesIn, StructureIn, StructureOut, SubstructureIn
from .store import CompoundStore

settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("npe")

SUMMARY_KEYS = ("compound_id", "name", "formula", "molecular_weight", "canonical_smiles", "pathway", "superclass", "class", "database", "is_demo")
SORT_KEYS = {"name", "molecular_weight", "logp", "tpsa", "pathway", "superclass", "class", "formula", "organism", "database", "relevance"}


def load_store() -> CompoundStore:
    if settings.database_url:
        from .db import Database

        db = Database(settings.database_url)
        db.init_schema()
        if db.count() == 0:
            db.seed(json.loads(settings.seed_path.read_text())["compounds"])
        records = db.load_records()
        store = CompoundStore(records, {"source": "postgresql"}, backend="postgresql")
        store.db = db
        log.info("Loaded %d compounds from PostgreSQL (pgvector=%s)", len(records), db.has_pgvector)
        return store
    return CompoundStore.from_json(settings.seed_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = load_store()
    app.state.store = store
    app.state.predictor = KnnBaselinePredictor(store)
    app.state.npc_bert = (
        NPCBertClient(settings.npc_bert_api_url, settings.npc_bert_api_key, settings.npc_bert_timeout_seconds)
        if settings.npc_bert_api_url else None
    )
    app.state.cache = Cache(settings.redis_url, settings.cache_ttl_seconds)
    app.state.adapters = build_adapters(settings)
    app.state.statistics = await run_in_threadpool(analytics.compute_statistics, store.records)
    app.state.ontology = analytics.build_ontology(store.records, json.loads(settings.ontology_path.read_text()))
    log.info("Ready: %d compounds, NPC-BERT %s", len(store.records), "configured" if app.state.npc_bert else "not configured (demo baseline)")
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Cheminformatics API for natural products: RDKit structure processing, search, similarity, "
    "classification and NPC-BERT-ready prediction. Values are labelled as calculated, curated, database or predicted.",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(RateLimitMiddleware, per_minute=settings.rate_limit_per_minute)
app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_bytes)
app.add_middleware(AccessLogMiddleware)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origin_list, allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
)


# ---------------------------------------------------------------- errors
@app.exception_handler(chem.ChemError)
async def chem_error(_: Request, exc: chem.ChemError):
    return JSONResponse({"error": "Invalid chemical input", "detail": str(exc)}, status_code=422)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    detail = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse({"error": "Validation failed", "detail": detail}, status_code=422)


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse({"error": exc.detail if isinstance(exc.detail, str) else "Error", "detail": exc.detail}, status_code=exc.status_code)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.exception("Unhandled error: %s", exc)
    return JSONResponse({"error": "Internal server error"}, status_code=500)


# ---------------------------------------------------------------- helpers
def store_of(request: Request) -> CompoundStore:
    return request.app.state.store


def summary(rec: dict[str, Any], **extra: Any) -> dict[str, Any]:
    s = {k: rec.get(k) for k in SUMMARY_KEYS}
    s["organism"] = (rec.get("organism") or {}).get("name")
    s["logp"] = rec["properties"]["logp"]
    s["tpsa"] = rec["properties"]["tpsa"]
    s.update(extra)
    return s


def mol_from_query(kind: str, value: str) -> Chem.Mol:
    return chem.parse_inchi(value) if kind == "inchi" else chem.parse_smiles(value)


# ---------------------------------------------------------------- routes
@app.get("/api/health", tags=["meta"])
async def health(request: Request):
    st = store_of(request)
    return {
        "status": "ok",
        "compounds": len(st.records),
        "storage": st.backend,
        "pgvector": bool(st.db and st.db.has_pgvector),
        "npc_bert_configured": request.app.state.npc_bert is not None,
        "remote_adapters": settings.enable_remote_adapters,
    }


@app.get("/api/search", tags=["search"])
async def search(
    request: Request,
    q: str = Query("", max_length=2000),
    pathway: list[str] | None = Query(None),
    superclass: list[str] | None = Query(None),
    np_class: list[str] | None = Query(None, alias="class"),
    kingdom: list[str] | None = Query(None),
    database: list[str] | None = Query(None),
    organism: str | None = Query(None, max_length=200),
    mw_min: float | None = None, mw_max: float | None = None,
    logp_min: float | None = None, logp_max: float | None = None,
    tpsa_min: float | None = None, tpsa_max: float | None = None,
    sort: str = "relevance", order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
    remote: bool = False,
):
    st = store_of(request)
    q = chem.clean_text(q, 2000)
    qt = chem.detect_query_type(q) if q else chem.QueryType("all", "")
    scored: list[tuple[dict[str, Any], dict[str, Any]]] = []
    message = None
    structure = None

    if qt.kind == "all":
        scored = [(r, {"relevance": 0}) for r in st.records]
    elif qt.kind == "name":
        scored = [(r, {"relevance": s, "match_type": "text"}) for r in st.records if (s := st.text_match(r, qt.value))]
    elif qt.kind in ("smiles", "inchi"):
        mol = mol_from_query(qt.kind, qt.value)
        ids = chem.identifiers(mol)
        structure = {"canonical_smiles": ids["canonical_smiles"], "inchikey": ids["inchikey"], "valid": True}
        hit = st.get_by_inchikey(ids["inchikey"])
        if hit:
            scored.append((hit, {"relevance": 200, "match_type": "exact", "similarity": 1.0}))
        sims, _ = st.similarity(mol, 0.35, 20)
        scored += [(r, {"relevance": 100 * s, "match_type": "similar", "similarity": round(s, 4)}) for r, s in sims if not hit or r is not hit]
        if not scored:
            message = "Valid structure, not in the local database. Open it in the explorer to compute properties and predictions."
    elif qt.kind == "inchikey":
        hit = st.get_by_inchikey(qt.value)
        scored = [(hit, {"relevance": 200, "match_type": "exact"})] if hit else []
    else:  # database identifiers
        hit = st.get_by_external(qt.kind, qt.value)
        scored = [(hit, {"relevance": 200, "match_type": "identifier"})] if hit else []
        if not hit:
            message = f"No local record with this {qt.kind.replace('_', ' ')}."

    filters = {"pathway": pathway, "superclass": superclass, "class": np_class, "kingdom": kingdom, "database": database,
               "organism": organism, "molecular_weight_min": mw_min, "molecular_weight_max": mw_max,
               "logp_min": logp_min, "logp_max": logp_max, "tpsa_min": tpsa_min, "tpsa_max": tpsa_max}
    extras = {id(r): e for r, e in scored}
    matched = [r for r, _ in scored]
    facets = st.facets(matched)
    filtered = st.filter(matched, filters)

    if sort not in SORT_KEYS:
        raise HTTPException(400, f"Unsupported sort key '{sort}'")
    if sort == "relevance":
        filtered.sort(key=lambda r: (-extras[id(r)].get("relevance", 0), r["name"].lower()))
    else:
        filtered.sort(key=lambda r: (st.value(r, sort) is None, st.value(r, sort) if not isinstance(st.value(r, sort), str) else st.value(r, sort).lower()),
                      reverse=order == "desc")
    total = len(filtered)
    start = (page - 1) * page_size
    results = [summary(r, **{k: v for k, v in extras[id(r)].items() if k != "relevance"}) for r in filtered[start:start + page_size]]

    external = None
    if remote and q and qt.kind != "all":
        if not settings.enable_remote_adapters:
            external = {"enabled": False, "message": "Remote database adapters are disabled (ENABLE_REMOTE_ADAPTERS=false)."}
        else:
            cache = request.app.state.cache
            key = cache.key("federated", [qt.kind, qt.value])
            external = cache.get(key)
            if external is None:
                kind = "smiles" if qt.kind == "smiles" else qt.kind
                external = {"enabled": True, **await federated_search(request.app.state.adapters, kind, qt.value)}
                cache.set(key, external)

    return {
        "query": q, "query_type": qt.kind, "total": total, "page": page, "page_size": page_size,
        "pages": max(1, math.ceil(total / page_size)), "results": results, "facets": facets,
        "structure": structure, "message": message, "external": external,
    }


@app.get("/api/compound/{compound_id}", tags=["compound"])
async def get_compound(request: Request, compound_id: str):
    rec = store_of(request).get(chem.clean_text(compound_id, 64))
    if not rec:
        raise HTTPException(404, f"Compound '{compound_id}' not found")
    return rec


@app.get("/api/compound/{compound_id}/conformer", tags=["compound"])
async def get_conformer(request: Request, compound_id: str):
    rec = store_of(request).get(chem.clean_text(compound_id, 64))
    if not rec:
        raise HTTPException(404, f"Compound '{compound_id}' not found")
    path = settings.conformer_dir / f"{rec['compound_id']}.mol"
    charges = settings.conformer_dir / f"{rec['compound_id']}.charges.json"
    if path.exists():
        return {"compound_id": rec["compound_id"], "molblock": path.read_text(), "method": rec.get("conformer_method"),
                "partial_charges": json.loads(charges.read_text()) if charges.exists() else None, "provenance": "calculated"}
    conf = await run_in_threadpool(chem.conformer_3d, rec["canonical_smiles"])
    return {"compound_id": rec["compound_id"], "molblock": conf["molblock"], "method": conf["method"],
            "partial_charges": conf["partial_charges"], "provenance": "calculated"}


@app.post("/api/compound/structure", response_model=StructureOut, tags=["compound"])
async def compound_structure(request: Request, body: StructureIn):
    cache = request.app.state.cache
    key = cache.key("structure", [body.smiles, body.include_3d])
    if (cached := cache.get(key)) is not None:
        return cached
    mol = chem.parse_smiles(body.smiles)
    record = await run_in_threadpool(chem.structure_record, mol, body.smiles, body.include_3d)
    cache.set(key, record)
    return record


@app.post("/api/predict", response_model=PredictOut, response_model_by_alias=True, tags=["prediction"])
async def predict(request: Request, body: SmilesIn):
    mol = chem.parse_smiles(body.smiles)
    cache = request.app.state.cache
    key = cache.key("predict", [chem.identifiers(mol)["canonical_smiles"], bool(request.app.state.npc_bert)])
    if (cached := cache.get(key)) is not None:
        return cached
    fallback = None
    result = None
    if request.app.state.npc_bert is not None:
        try:
            result = await request.app.state.npc_bert.predict(mol, body.smiles)
            result["explanation"].setdefault("features", detect_features(mol))
        except Exception as exc:  # noqa: BLE001
            fallback = f"NPC-BERT service error ({type(exc).__name__}); showing demo baseline instead."
            log.warning("NPC-BERT call failed: %s", exc)
    if result is None:
        result = await run_in_threadpool(request.app.state.predictor.predict, mol, body.smiles)
    result["fallback_reason"] = fallback
    if fallback is None:
        cache.set(key, result)
    return result


@app.post("/api/exact", tags=["search"])
async def exact(request: Request, body: SmilesIn):
    mol = chem.parse_smiles(body.smiles)
    hit = store_of(request).exact(mol)
    return {"query": body.smiles, "inchikey": chem.identifiers(mol)["inchikey"], "results": [summary(hit, similarity=1.0)] if hit else []}


@app.post("/api/similarity", tags=["search"])
async def similarity(request: Request, body: SimilarityIn):
    mol = chem.parse_smiles(body.smiles)
    hits, method = await run_in_threadpool(store_of(request).similarity, mol, body.threshold, body.limit)
    return {
        "query": body.smiles, "threshold": body.threshold, "metric": "Tanimoto",
        "fingerprint": f"Morgan radius {chem.FP_RADIUS}, {chem.FP_BITS} bits", "method": method,
        "results": [summary(r, similarity=round(s, 4)) for r, s in hits],
    }


@app.post("/api/substructure", tags=["search"])
async def substructure(request: Request, body: SubstructureIn):
    patt = chem.parse_smarts(body.query)
    hits = await run_in_threadpool(store_of(request).substructure, patt, body.limit)
    return {"query": body.query, "results": [summary(r, match_atoms=atoms) for r, atoms in hits]}


@app.post("/api/compare", tags=["compare"])
async def compare(request: Request, body: CompareIn):
    st = store_of(request)
    recs = []
    for cid in body.ids:
        rec = st.get(cid)
        if not rec:
            raise HTTPException(404, f"Compound '{cid}' not found")
        recs.append(rec)
    from rdkit import DataStructs

    fps = [chem.morgan_fp(Chem.MolFromSmiles(r["canonical_smiles"])) for r in recs]
    matrix = [[round(DataStructs.TanimotoSimilarity(a, b), 4) for b in fps] for a in fps]
    return {"compounds": recs, "similarity_matrix": matrix, "metric": "Tanimoto (Morgan r=2, 2048 bits)"}


@app.get("/api/statistics", tags=["analytics"])
async def statistics(request: Request):
    return request.app.state.statistics


@app.get("/api/ontology", tags=["classification"])
async def ontology(request: Request):
    return request.app.state.ontology


@app.get("/api/databases", tags=["meta"])
async def databases(request: Request):
    st = store_of(request)
    return {
        "local": {"name": "NPE demo set", "count": len(st.records), "storage": st.backend, "meta": st.meta},
        "remote_enabled": settings.enable_remote_adapters,
        "adapters": [a.info(settings.enable_remote_adapters) for a in request.app.state.adapters],
    }
