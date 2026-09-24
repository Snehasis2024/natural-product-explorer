-- Natural Product Explorer schema (PostgreSQL 16 + pgvector >= 0.7)
-- Executed automatically by the postgres container (docker-entrypoint-initdb.d) and by the API
-- on first start if the table does not exist.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS compounds (
    compound_id       TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    smiles            TEXT NOT NULL,
    canonical_smiles  TEXT NOT NULL,
    inchi             TEXT,
    inchikey          CHAR(27) NOT NULL UNIQUE,
    formula           TEXT,
    molecular_weight  DOUBLE PRECISION,
    exact_mass        DOUBLE PRECISION,
    logp              DOUBLE PRECISION,
    tpsa              DOUBLE PRECISION,
    pathway           TEXT,
    superclass        TEXT,
    np_class          TEXT,
    organism          TEXT,
    kingdom           TEXT,
    database          TEXT NOT NULL,          -- source database of the record (e.g. 'NPE demo set', 'COCONUT')
    database_id       TEXT,                   -- identifier inside that source
    source_url        TEXT,
    literature        JSONB NOT NULL DEFAULT '[]'::jsonb,
    record            JSONB NOT NULL,         -- full unified-schema record incl. provenance labels
    fp                BIT(2048),              -- Morgan radius-2 fingerprint (RDKit), for pgvector Jaccard search
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compounds_name_trgm ON compounds USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS compounds_pathway ON compounds (pathway, superclass, np_class);
CREATE INDEX IF NOT EXISTS compounds_mw ON compounds (molecular_weight);
-- Approximate nearest-neighbour index for Tanimoto (= 1 - Jaccard distance) similarity
CREATE INDEX IF NOT EXISTS compounds_fp_hnsw ON compounds USING hnsw (fp bit_jaccard_ops);

-- External cross-references (NPAtlas, COCONUT, PubChem, LOTUS, ChEBI)
CREATE TABLE IF NOT EXISTS compound_xrefs (
    compound_id  TEXT REFERENCES compounds(compound_id) ON DELETE CASCADE,
    source       TEXT NOT NULL,
    external_id  TEXT NOT NULL,
    PRIMARY KEY (compound_id, source, external_id)
);
