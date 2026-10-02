"""Dashboard "N proyek belum ditagih": beberapa job satu proyek dihitung satu."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.modules.dashboard import router as dashboard
from app.modules.invoices.service import InvoiceService


async def test_job_satu_proyek_dihitung_satu(monkeypatch: pytest.MonkeyPatch) -> None:
    async def palsu(self: InvoiceService, customer_id: str | None = None) -> dict[str, list[Any]]:
        return {
            "c1": [SimpleNamespace(proyek_id="p1"), SimpleNamespace(proyek_id="p1"), SimpleNamespace(proyek_id="p2")],
            "c2": [SimpleNamespace(proyek_id="p3")],
        }

    monkeypatch.setattr(InvoiceService, "jobs_belum_ditagih", palsu)
    assert await dashboard._count_proyek_belum_ditagih(object()) == 3  # type: ignore[arg-type]
