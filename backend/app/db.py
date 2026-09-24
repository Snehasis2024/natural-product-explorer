"""PostgreSQL persistence (optional). Schema lives in database/init.sql.

The database is the system of record when DATABASE_URL is set: the API seeds it from the demo JSON
on first start, reads all records back at startup, and delegates fingerprint similarity search to
pgvector (bit(2048) column, Jaccard distance operator ``<%>``).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rdkit import Chem
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from . import chem

if TYPE_CHECKING:  # pragma: no cover
    from .store import CompoundStore

log = logging.getLogger(__name__)

INIT_SQL = Path(__file__).resolve().parents[2] / "database" / "init.sql"


class Database:
    def __init__(self, url: str):
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        self.engine: Engine = create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)
        self.has_pgvector = False

    def init_schema(self) -> None:
        with self.engine.begin() as conn:
            exists = conn.execute(text("SELECT to_regclass('public.compounds')")).scalar()
            if not exists and INIT_SQL.exists():
                log.info("Creating schema from %s", INIT_SQL)
                conn.exec_driver_sql(INIT_SQL.read_text())
            self.has_pgvector = bool(
                conn.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")).scalar()
            )

    def count(self) -> int:
        with self.engine.connect() as conn:
            return int(conn.execute(text("SELECT count(*) FROM compounds")).scalar() or 0)

    def seed(self, records: list[dict[str, Any]]) -> None:
        rows = []
        for r in records:
            org = r.get("organism") or {}
            rows.append({
                "compound_id": r["compound_id"], "name": r["name"], "smiles": r["smiles"],
                "canonical_smiles": r["canonical_smiles"], "inchi": r["inchi"], "inchikey": r["inchikey"],
                "formula": r["formula"], "molecular_weight": r["molecular_weight"], "exact_mass": r["exact_mass"],
                "logp": r["properties"]["logp"], "tpsa": r["properties"]["tpsa"],
                "pathway": r["pathway"], "superclass": r["superclass"], "np_class": r["class"],
                "organism": org.get("name"), "kingdom": org.get("kingdom"),
                "database": r["database"], "database_id": r["database_id"], "source_url": r["source_url"],
                "literature": json.dumps(r.get("literature") or []), "record": json.dumps(r),
                "fp": chem.morgan_fp(Chem.MolFromSmiles(r["canonical_smiles"])).ToBitString(),
            })
        fp_expr = "CAST(:fp AS bit(2048))" if self.has_pgvector else ":fp"
        sql = text(f"""
            INSERT INTO compounds (compound_id, name, smiles, canonical_smiles, inchi, inchikey, formula,
                molecular_weight, exact_mass, logp, tpsa, pathway, superclass, np_class, organism, kingdom,
                database, database_id, source_url, literature, record, fp)
            VALUES (:compound_id, :name, :smiles, :canonical_smiles, :inchi, :inchikey, :formula,
                :molecular_weight, :exact_mass, :logp, :tpsa, :pathway, :superclass, :np_class, :organism, :kingdom,
                :database, :database_id, :source_url, CAST(:literature AS jsonb), CAST(:record AS jsonb), {fp_expr})
            ON CONFLICT (compound_id) DO NOTHING""")
        with self.engine.begin() as conn:
            conn.execute(sql, rows)
        log.info("Seeded %d compounds into PostgreSQL", len(rows))

    def load_records(self) -> list[dict[str, Any]]:
        with self.engine.connect() as conn:
            return [row[0] for row in conn.execute(text("SELECT record FROM compounds ORDER BY name"))]

    def similarity(self, bitstring: str, threshold: float, limit: int, store: "CompoundStore"):
        if not self.has_pgvector:
            raise RuntimeError("pgvector extension not installed")
        sql = text("""
            SELECT compound_id, 1 - (fp <%> CAST(:q AS bit(2048))) AS tanimoto
            FROM compounds
            WHERE 1 - (fp <%> CAST(:q AS bit(2048))) >= :t
            ORDER BY fp <%> CAST(:q AS bit(2048))
            LIMIT :k""")
        with self.engine.connect() as conn:
            rows = conn.execute(sql, {"q": bitstring, "t": threshold, "k": limit}).all()
        return [(store.get(cid), float(sim)) for cid, sim in rows if store.get(cid)]
