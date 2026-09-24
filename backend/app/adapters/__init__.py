from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..config import Settings
from .base import DatabaseAdapter
from .chebi import ChebiAdapter
from .coconut import CoconutAdapter
from .lotus import LotusAdapter
from .npatlas import NPAtlasAdapter
from .pubchem import PubChemAdapter

log = logging.getLogger(__name__)


def build_adapters(settings: Settings) -> list[DatabaseAdapter]:
    t = settings.http_timeout_seconds
    return [
        PubChemAdapter(t), NPAtlasAdapter(t), CoconutAdapter(t, settings.coconut_api_token),
        LotusAdapter(t), ChebiAdapter(t),
    ]


async def federated_search(adapters: list[DatabaseAdapter], kind: str, value: str) -> dict[str, Any]:
    """Query every adapter supporting `kind` concurrently; failures are reported, not raised."""
    targets = [a for a in adapters if kind in a.supports and a.configured()]

    async def run(a: DatabaseAdapter):
        try:
            return a.name, await a.search(kind, value), None
        except Exception as exc:  # noqa: BLE001
            log.warning("%s adapter failed: %s", a.name, exc)
            return a.name, [], f"{type(exc).__name__}: {exc}"[:300]

    results = await asyncio.gather(*(run(a) for a in targets))
    return {
        "results": [r for _, recs, _ in results for r in recs],
        "sources": [{"name": n, "count": len(recs), "error": err} for n, recs, err in results],
    }
