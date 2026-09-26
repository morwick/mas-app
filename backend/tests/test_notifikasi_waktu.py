"""Waktu notifikasi tidak pernah di masa depan (tidak ada durasi minus) dan
urutannya dari yang terbaru ke yang terlama."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

from app.core.timeutil import iso_utc, parse_iso
from app.modules.notifications.service import NotificationService

NOW = datetime(2026, 9, 26, 3, 0, tzinfo=UTC)


class _Q:
    """Rantai query PostgREST palsu: semua metode filter mengembalikan diri sendiri."""

    def __init__(self, data: list[dict[str, Any]]) -> None:
        self._data = data

    def __getattr__(self, _: str) -> Any:
        return lambda *a, **k: self

    @property
    def not_(self) -> "_Q":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self._data, count=len(self._data))


class _Db:
    def __init__(self, data: dict[str, list[dict[str, Any]]]) -> None:
        self.data = data

    def table(self, nama: str) -> _Q:
        return _Q(self.data.get(nama, []))


def _iso(**delta: float) -> str:
    return iso_utc(NOW + timedelta(**delta))


async def test_tidak_ada_waktu_di_masa_depan_dan_terbaru_dulu() -> None:
    db = _Db(
        {
            # Job belum berangkat & penawaran — kini bukan notifikasi (ada di dashboard).
            "jobs": [
                {
                    "id": "j1",
                    "job_number": "JOB-1",
                    "etd": _iso(hours=-5),
                    "status_job": "ditugaskan",
                    "accepted_at": None,
                    "driver": {"nama": "Andi"},
                    "unit": {"kode_unit": "TR-01"},
                }
            ],
            "quotations": [
                {
                    "id": "q1",
                    "quote_number": "Q-1",
                    "customer_nama": "PT A",
                    "status_penawaran": "terkirim",
                    "tanggal": (NOW - timedelta(days=20)).date().isoformat(),
                    "berlaku_sampai": (NOW + timedelta(days=2)).date().isoformat(),
                    "total": 1,
                },
            ],
            # Dua tagihan lewat jatuh tempo — tetap notifikasi.
            "invoices": [
                {
                    "id": "inv1",
                    "invoice_number": "INV-1",
                    "customer_nama": "PT A",
                    "jatuh_tempo": (NOW - timedelta(days=3)).date().isoformat(),
                    "total": 100,
                    "dibayar": 0,
                },
                {
                    "id": "inv2",
                    "invoice_number": "INV-2",
                    "customer_nama": "PT B",
                    "jatuh_tempo": (NOW - timedelta(days=10)).date().isoformat(),
                    "total": 100,
                    "dibayar": 50,
                },
            ],
        }
    )
    hasil = await NotificationService(db).build(now=NOW)  # type: ignore[arg-type]
    ids = {n.id for n in hasil}
    assert {"invoice-jt-inv1", "invoice-jt-inv2"} <= ids
    waktu = [parse_iso(n.created_at) for n in hasil]
    assert all(w <= NOW for w in waktu), [n.created_at for n in hasil]
    assert waktu == sorted(waktu, reverse=True)
    # Job belum berangkat / dikonfirmasi, dokumen, insiden, dan penawaran pindah ke dashboard.
    assert not any(i.startswith(("job-", "doc-", "incident-", "quotation-")) for i in ids)
