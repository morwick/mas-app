"""Dashboard "Perlu tindakan": penawaran deal yang masih punya item deal tanpa job."""

from types import SimpleNamespace
from typing import Any

from app.modules.dashboard.router import penawaran_deal_tanpa_proyek


class _Q:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self._data = data

    def __getattr__(self, _: str) -> Any:
        return lambda *a, **k: self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self._data)


class _Db:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data

    def table(self, _nama: str) -> _Q:
        return _Q(self.data)


async def test_dihitung_per_penawaran_cukup_satu_proyek_aktif() -> None:
    db = _Db(
        [
            {
                # 2 item deal, baru 1 yang punya proyek → TIDAK dihitung (cukup satu proyek).
                "id": "q1",
                "quote_number": "0001/SK",
                "customer_nama": "PT A",
                "quotation_items": [{"id": "a", "keputusan": "deal"}, {"id": "b", "keputusan": "deal"}],
                "jobs": [{"proyek_id": "p1", "status_job": "selesai"}],
            },
            {
                # Satu-satunya job dibatalkan → belum ada proyek aktif → dihitung.
                "id": "q2",
                "quote_number": "0002/SK",
                "customer_nama": "PT B",
                "quotation_items": [{"id": "c", "keputusan": "deal"}],
                "jobs": [{"proyek_id": "p2", "status_job": "cancelled"}],
            },
            {
                # Deal tanpa job sama sekali → dihitung.
                "id": "q3",
                "quote_number": "0003/SK",
                "customer_nama": "PT C",
                "quotation_items": [{"id": "d", "keputusan": "deal"}, {"id": "e", "keputusan": "ditolak"}],
                "jobs": [],
            },
            {
                # Tidak ada item deal → tidak dihitung.
                "id": "q4",
                "quote_number": "0004/SK",
                "customer_nama": "PT D",
                "quotation_items": [{"id": "f", "keputusan": "ditolak"}],
                "jobs": [],
            },
        ]
    )
    assert await penawaran_deal_tanpa_proyek(db) == 2  # type: ignore[arg-type]
