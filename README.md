# Natural Product Explorer

Interactive research platform for natural products: an interactive **3D molecular viewer**, RDKit
**cheminformatics**, **natural-product classification** (pathway › superclass › class), **structure
search** (exact, substructure, similarity), **comparison** with synchronised viewers, **chemical-space
analytics**, and an **AI prediction** interface ready for an external **NPC-BERT** model.

```
SMILES → validate → parse → 2D depiction → 3D conformer → properties → classification → AI prediction → source & literature
```

> **Demo data.** The bundled dataset contains 76 well-known natural products (caffeine, curcumin,
> quercetin, resveratrol, paclitaxel, artemisinin, penicillin G, vancomycin, …). Structures are
> curated, and the test suite checks reference compounds against their standard InChIKeys
> (stereochemistry included). All properties are **calculated** with RDKit. Classifications,
> organisms and references are **curated demo annotations**. No experimental values are included.
> Every value in the UI and API carries a provenance label: `calculated`, `curated`, `database`,
> `predicted`, `demo` or `experimental`.

---

## Contents

- [Architecture](#architecture)
- [Quick start (Docker)](#quick-start-docker)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [RDKit setup](#rdkit-setup)
- [Database setup](#database-setup)
- [NPC-BERT integration](#npc-bert-integration)
- [External database adapters](#external-database-adapters)
- [API documentation](#api-documentation)
- [Static deployment (GitHub Pages)](#static-deployment-github-pages)
- [Testing](#testing)
- [Scientific notes and limitations](#scientific-notes-and-limitations)

## Architecture

```
natural-product-explorer/
├── frontend/                React 18 + TypeScript + Vite + Tailwind CSS
│   ├── src/lib/engine/      Engine interface: ApiEngine (FastAPI) | BrowserEngine (RDKit.js)
│   ├── src/components/      MolViewer3D (3Dmol.js), Properties, Classification, Prediction, …
│   ├── src/pages/           Home, Explore, Search, AI Classification, Compare, Databases, About, Explorer
│   ├── e2e/                 Playwright end-to-end tests
│   └── public/data/         Static dataset export used by the browser engine
├── backend/                 Python FastAPI + RDKit
│   ├── app/chem.py          parsing, descriptors, depiction, ETKDGv3/MMFF94 conformers, Gasteiger charges
│   ├── app/store.py         repository, text search, filters, SubstructLibrary, FAISS / pgvector similarity
│   ├── app/predict.py       NPC-BERT client + transparent kNN baseline
│   ├── app/adapters/        PubChem, NPAtlas, COCONUT, LOTUS (Wikidata), ChEBI (OLS4)
│   ├── app/analytics.py     distributions, PCA / t-SNE chemical space, ontology tree
│   └── tests/               pytest suite
├── database/
│   ├── init.sql             PostgreSQL + pgvector schema
│   ├── seed/                curated sources (CSV/JSON) and generated compounds.json + 3D conformers
│   └── scripts/build_seed.py
└── docker-compose.yml       db (pgvector) · redis · backend · frontend (nginx)
```

| Layer | Technology |
|---|---|
| UI | React, TypeScript, Vite, Tailwind CSS, Inter / JetBrains Mono |
| 3D | 3Dmol.js (ball-and-stick, stick, spacefill, line, VDW surface, charge colouring, atom picking) |
| 2D | RDKit.js (WebAssembly) depictions with stereo annotation and substructure highlighting |
| Charts | Recharts (distributions, histograms, PCA / t-SNE scatter) |
| API | FastAPI, Pydantic v2, rate limiting, request-size limits, CORS, GZip, structured errors |
| Chemistry | RDKit 2026.03 (Python) and RDKit.js 2026.03 (browser); OpenChemLib for in-browser 3D |
| Storage | PostgreSQL 16 + pgvector (Morgan fingerprints as `bit(2048)`, Jaccard/HNSW index) |
| Vector search | pgvector (`<%>` Jaccard distance = 1 − Tanimoto) · FAISS binary index for large in-memory sets |
| Cache | Redis (optional; in-process TTL cache otherwise) |
| Deploy | Docker Compose; static build for GitHub Pages |

**Two engines, one interface.** The frontend probes `/api/health` at startup. With the API it uses
Python RDKit, PostgreSQL and the NPC-BERT proxy. Without it (static hosting) it switches to the
**browser engine**: RDKit.js reproduces the same descriptors and Morgan fingerprints (verified
bit-for-bit), the same kNN baseline and SMARTS features, precomputed RDKit 3D conformers for
database compounds, and OpenChemLib ConformerGenerator + MMFF94s+ for new SMILES. The badge in the
header shows which engine is active (`API` or `Browser`).

## Quick start (Docker)

```bash
cp .env.example .env            # set POSTGRES_PASSWORD at least
docker compose up --build
```

| URL | Service |
|---|---|
| http://localhost:8080 | Web app (nginx, proxies `/api` to the backend) |
| http://localhost:8000/docs | Interactive OpenAPI docs (Swagger UI) |
| http://localhost:8000/api/health | Health check |

On first start the API creates the schema (also mounted as `docker-entrypoint-initdb.d`), seeds
PostgreSQL from `database/seed/compounds.json`, and enables pgvector similarity search.

## Local development

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000     # uses database/seed JSON when DATABASE_URL is empty
pytest -q
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api → http://127.0.0.1:8000
npm run build        # production build in dist/
```

`VITE_ENGINE=browser npm run build` forces the browser engine; `VITE_API_URL=https://api.example.org`
points a separately hosted frontend at a remote API. The API must list that origin in `CORS_ORIGINS`.

### Regenerating the dataset

Edit the curated sources in `database/seed/` (`curated_compounds.csv`, `annotations.json`,
`ontology.json`, `np_features.json`), then:

```bash
python database/scripts/build_seed.py
```

This recomputes identifiers, properties and 3D conformers with RDKit, and refreshes the static
export in `frontend/public/data/`.

## Environment variables

All secrets are read by the backend only. The frontend never receives API keys.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | *(empty → JSON seed)* | `postgresql+psycopg://user:pass@host:5432/db` |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | – | docker-compose database |
| `NPC_BERT_API_URL` | *(empty → demo baseline)* | NPC-BERT inference endpoint |
| `NPC_BERT_API_KEY` | – | Sent as `Authorization: Bearer …` to NPC-BERT |
| `NPC_BERT_TIMEOUT_SECONDS` | `20` | |
| `ENABLE_REMOTE_ADAPTERS` | `false` | Enable PubChem / NPAtlas / COCONUT / LOTUS / ChEBI lookups |
| `PUBCHEM_API_KEY` | – | Reserved; PUG REST currently needs no key |
| `COCONUT_API_TOKEN` | – | Personal access token for the COCONUT API |
| `REDIS_URL` | – | e.g. `redis://redis:6379/0` |
| `CACHE_TTL_SECONDS` | `3600` | |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:8080,…` | Comma-separated |
| `RATE_LIMIT_PER_MINUTE` | `120` | Per client IP, `/api/*` |
| `MAX_REQUEST_BYTES` | `262144` | Larger bodies get HTTP 413 |
| `LOG_LEVEL` | `INFO` | |

Frontend build-time variables: `VITE_ENGINE` (`auto`, `api` or `browser`) and `VITE_API_URL`.

## RDKit setup

`pip install rdkit` installs self-contained wheels (Python 3.9–3.13), including the Contrib SA_Score
and NP_Score models used for synthetic accessibility and NP-likeness. On slim Linux images, RDKit's
drawing module also needs `libxrender1 libxext6 libexpat1` (installed in `backend/Dockerfile`). Conda
users can instead run `conda install -c conda-forge rdkit`.

Calculated values: formula, MW (average), exact mass, Wildman–Crippen LogP and MR, TPSA, HBD/HBA,
rotatable bonds, rings, aromatic rings, formal charge, stereocentres (incl. unassigned), Fsp³, QED,
SA score, NP-likeness, Bertz CT, Lipinski and Veber rules. 3D: ETKDGv3 embedding (seeded) + MMFF94
minimisation (UFF fallback), Gasteiger–Marsili partial charges.

## Database setup

`database/init.sql` creates:

- `compounds`: unified schema columns (`compound_id, name, smiles, inchi, inchikey, formula,
  molecular_weight, exact_mass, pathway, superclass, np_class, organism, database, database_id,
  literature, source_url`), the full record as `jsonb` with provenance labels, and
  `fp bit(2048)` Morgan fingerprints with an HNSW `bit_jaccard_ops` index.
- `compound_xrefs`: cross-references to external databases.

Without Docker: `createdb npexplorer && psql npexplorer -f database/init.sql` (needs pgvector ≥ 0.7),
then set `DATABASE_URL`. The API seeds an empty table automatically.

## NPC-BERT integration

`POST /api/predict` forwards the canonical SMILES to `NPC_BERT_API_URL` when it is set:

```http
POST {NPC_BERT_API_URL}
Content-Type: application/json
Authorization: Bearer {NPC_BERT_API_KEY}      # only if configured

{"smiles": "CC1=C..."}
```

Expected response (extra fields are ignored; `probability` is accepted as an alias of `confidence`):

```json
{
  "pathway":    {"label": "Terpenoids", "confidence": 0.98},
  "superclass": {"label": "Sesquiterpenoids", "confidence": 0.95},
  "class":      {"label": "Cadinane sesquiterpenoids", "confidence": 0.90},
  "top_k": [
    {"label": "Cadinane sesquiterpenoids", "confidence": 0.90, "level": "class"},
    {"label": "Germacrane sesquiterpenoids", "confidence": 0.05, "level": "class"}
  ],
  "model_version": "npc-bert-1.0"
}
```

`NPCBertClient.normalise()` in `backend/app/predict.py` maps this to the public schema. If the
service fails, the API falls back to the baseline and sets `fallback_reason`.

**Without NPC-BERT**, a transparent **similarity-weighted kNN baseline** runs: the 7 most similar
reference compounds (Morgan r=2, Tanimoto), weighted by similarity², leave-one-out, with an
applicability-domain flag (max similarity < 0.35 → unreliable). These results are always labelled
**"Demo prediction — connect NPC-BERT API"** (`model.is_demo = true`). The probabilities are vote
shares, not calibrated model outputs.

## External database adapters

Adapters (`backend/app/adapters/`) use official APIs only and map results to the unified schema
with `provenance = "database"`. They are disabled unless `ENABLE_REMOTE_ADAPTERS=true`. In the UI,
enable **Search › Include external databases**.

| Adapter | API | Query kinds |
|---|---|---|
| PubChem | PUG REST | name, CID, InChIKey, SMILES, InChI |
| NPAtlas | NPAtlas REST v1 | NPAtlas ID, InChIKey, name |
| COCONUT | COCONUT 2 REST (token) | COCONUT ID, InChIKey, name |
| LOTUS | Wikidata SPARQL (`P235` InChIKey → `P703` found in taxon, references) | InChIKey |
| ChEBI | EBI OLS4 search | name, ChEBI ID |

The build environment for this project had no outbound access to these services, so the adapters
could not be exercised live. PubChem, Wikidata and OLS4 follow long-stable documented endpoints.
Verify the NPAtlas and COCONUT endpoint shapes against their current documentation before relying
on them. Failures are reported per source in the response and never break local search.

## API documentation

Interactive docs: `GET /docs` (Swagger) and `GET /redoc`. Errors use `{"error": str, "detail": …}`.
Invalid chemistry returns **422**, oversize bodies **413**, rate limiting **429** (with `Retry-After`).

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Status, storage backend, pgvector, NPC-BERT configured |
| GET | `/api/search` | Search by name/SMILES/InChI/InChIKey/CID/NPAtlas/COCONUT/ChEBI + filters, sort, pagination, facets |
| GET | `/api/compound/{id}` | Full unified record |
| GET | `/api/compound/{id}/conformer` | 3D molblock + Gasteiger charges |
| POST | `/api/compound/structure` | SMILES → canonical IDs, properties, SVG, 2D/3D molblocks |
| POST | `/api/predict` | Pathway / superclass / class prediction with top-k and explanation |
| POST | `/api/exact` | Exact structure match (InChIKey) |
| POST | `/api/similarity` | Tanimoto similarity (Morgan r=2, 2048 bits) with threshold |
| POST | `/api/substructure` | SMILES/SMARTS substructure search with matched atoms |
| POST | `/api/compare` | 2–4 compounds + pairwise Tanimoto matrix |
| GET | `/api/statistics` | Distributions, histograms, PCA / t-SNE coordinates |
| GET | `/api/ontology` | Pathway › superclass › class tree with counts and representatives |
| GET | `/api/databases` | Local dataset and adapter status |

Search parameters: `q`, `pathway`, `superclass`, `class`, `kingdom`, `database` (repeatable),
`organism`, `mw_min/max`, `logp_min/max`, `tpsa_min/max`, `sort`
(`relevance|name|molecular_weight|logp|tpsa|pathway|superclass|class|formula|organism|database`),
`order` (`asc|desc`), `page`, `page_size` (≤ 100), `remote` (bool).

### Examples

```bash
# Structure → properties + 3D
curl -s -X POST localhost:8000/api/compound/structure \
  -H 'Content-Type: application/json' \
  -d '{"smiles":"COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O"}'
```

```json
{
  "smiles": "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O",
  "canonical_smiles": "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O",
  "inchikey": "VFLDPWHFBUODDF-FCXRPNKRSA-N",
  "formula": "C21H20O6",
  "molecular_weight": 368.385,
  "exact_mass": 368.12599,
  "logp": 3.37,
  "tpsa": 93.06,
  "hbd": 2,
  "hba": 6,
  "rotatable_bonds": 8,
  "rings": 2,
  "stereocenters": 0,
  "qed": 0.548,
  "sa_score": 2.43,
  "np_likeness": 0.72,
  "lipinski": {"violations": 0, "pass": true, "rules": ["…"]},
  "conformer": {"method": "RDKit ETKDGv3 + MMFF94 minimisation", "energy_kcal_mol": 41.354, "num_atoms_with_h": 47},
  "molblock": "\n     RDKit          3D\n…",
  "sdf": "…$$$$\n",
  "svg": "<?xml version='1.0' …",
  "provenance": "calculated"
}
```

```bash
# Prediction
curl -s -X POST localhost:8000/api/predict -H 'Content-Type: application/json' \
  -d '{"smiles":"O=c1c(O)c(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12"}'
```

```json
{
  "model": {"name": "Similarity-weighted kNN baseline", "type": "demo-knn", "is_demo": true,
            "notice": "Demo prediction — connect NPC-BERT API", "reference_set_size": 76},
  "pathway":    {"label": "Shikimates and Phenylpropanoids", "confidence": 1.0},
  "superclass": {"label": "Flavonoids", "confidence": 1.0},
  "class":      {"label": "Flavonols", "confidence": 0.7276},
  "top_k": [{"label": "Flavonols", "probability": 0.7276, "level": "class"},
            {"label": "Flavones", "probability": 0.1983, "level": "class"},
            {"label": "Isoflavones", "probability": 0.0742, "level": "class"}],
  "explanation": {"nearest_neighbors": ["…"], "features": ["…"],
                  "applicability_domain": {"max_similarity": 0.7838, "in_domain": true}},
  "provenance": "predicted"
}
```

```bash
# Search: terpenoids, heaviest first
curl -s 'localhost:8000/api/search?pathway=Terpenoids&sort=molecular_weight&order=desc&page_size=3'
# Identifier search (PubChem CID, InChIKey, ChEBI…)
curl -s 'localhost:8000/api/search?q=RYYVLZVUVIJVGH-UHFFFAOYSA-N'
# Similarity
curl -s -X POST localhost:8000/api/similarity -H 'Content-Type: application/json' \
  -d '{"smiles":"O=c1c(O)c(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12","threshold":0.7}'
# Substructure (β-lactam)
curl -s -X POST localhost:8000/api/substructure -H 'Content-Type: application/json' -d '{"query":"O=C1CCN1"}'
# Compare
curl -s -X POST localhost:8000/api/compare -H 'Content-Type: application/json' -d '{"ids":["quercetin","kaempferol"]}'
```

Invalid input:

```json
{"error": "Invalid chemical input", "detail": "Invalid chemistry: Can't kekulize mol.  Unkekulized atoms: 0 1 2 3 4"}
```

## Static deployment (GitHub Pages)

`.github/workflows/pages.yml` builds the frontend with the browser engine and publishes `dist/` to
GitHub Pages on every push to `main`. Enable it once under **Settings › Pages › Source: GitHub
Actions**. The static site runs completely client-side: search, filters, structure search,
properties, 3D, comparison, analytics and the demo baseline all work. NPC-BERT, live QED/SA
scores for new structures and external database lookups need the API.

## Testing

```bash
cd backend && pytest -q                 # 30 tests: chemistry, API, validation, dataset integrity
cd frontend && npm run typecheck
cd frontend && npx playwright test      # 13 end-to-end tests against a running app (E2E_BASE_URL)
```

The Playwright suite covers search, name/SMILES/ID routing, SMILES validation and invalid input,
3D rendering and viewer controls, atom picking, SDF download, property calculation, filters,
sorting, pagination, empty and loading states, structure search, comparison, analytics, prediction
and mobile layout. It passes against all three deployments: API mode (Vite preview + FastAPI),
browser-only static mode, and the Docker Compose stack with PostgreSQL/pgvector.

## Scientific notes and limitations

- **Never fabricated:** structures are curated and validated; identifiers such as InChI and
  InChIKey are computed; external IDs (PubChem CID, ChEBI) are listed only where curated, and
  NPAtlas/COCONUT IDs are left empty rather than guessed; references are limited to well-known
  primary reports with DOIs.
- Classification labels follow the NPClassifier three-level scheme, but they are curated demo
  annotations, not NPClassifier output.
- Organisms are representative sources, and "geographic origin" is the native range of that
  organism, not a collection locality.
- 3D models are single computed conformers, not experimental geometries.
- The kNN baseline is a transparent placeholder for NPC-BERT and is labelled as a demo everywhere.
- UMAP is not computed; the chemical-space view offers PCA and t-SNE.

## Key references

- Kim, H. W. et al. NPClassifier. *J. Nat. Prod.* 2021, 84, 2795. doi:10.1021/acs.jnatprod.1c00399
- Rutz, A. et al. The LOTUS initiative. *eLife* 2022, 11, e70780. doi:10.7554/eLife.70780
- Sorokina, M. et al. COCONUT online. *J. Cheminform.* 2021, 13, 2. doi:10.1186/s13321-020-00478-9
- van Santen, J. A. et al. The Natural Products Atlas. *ACS Cent. Sci.* 2019, 5, 1824. doi:10.1021/acscentsci.9b00806
