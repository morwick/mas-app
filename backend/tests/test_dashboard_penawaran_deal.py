"""Dashboard "Perlu tindakan": penawaran deal yang masih punya item deal tanpa job."""

from types import SimpleNamespace
from typing import Any

from app.modules.dashboard.router import penawaran_deal_tanpa_job


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


async def test_hanya_item_deal_tanpa_job_aktif_yang_dihitung() -> None:
    db = _Db(
        [
            {
                # 2 item deal: 1 sudah ada job, 1 job-nya dibatalkan → 1 belum; 1 item ditolak diabaikan.
                "id": "q1",
                "quote_number": "0001/SK",
                "customer_nama": "PT A",
                "quotation_items": [
                    {"id": "a", "keputusan": "deal"},
                    {"id": "b", "keputusan": "deal"},
                    {"id": "c", "keputusan": "ditolak"},
                ],
                "jobs": [
                    {"quotation_item_id": "a", "status_job": "selesai"},
                    {"quotation_item_id": "b", "status_job": "cancelled"},
                ],
            },
            {
                # Semua item deal sudah punya job → tidak muncul.
                "id": "q2",
                "quote_number": "0002/SK",
                "customer_nama": "PT B",
                "quotation_items": [{"id": "d", "keputusan": "deal"}],
                "jobs": [{"quotation_item_id": "d", "status_job": "ditugaskan"}],
            },
        ]
    )
    assert await penawaran_deal_tanpa_job(db) == 1  # type: ignore[arg-type]
