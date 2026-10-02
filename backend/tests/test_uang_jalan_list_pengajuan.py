"""Menu Uang Jalan: hitungan pengajuan driver & tambahan menunggu approval."""

from types import SimpleNamespace
from typing import Any

from app.modules.uang_jalan.service import UangJalanService


class _Db:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data

    def table(self, *_: object) -> "_Db":
        return self

    def __getattr__(self, _nama: str) -> Any:
        return lambda *_a, **_k: self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data)


async def test_hitung_pengajuan_driver_dan_tambahan_menunggu_approval() -> None:
    db = _Db(
        [
            {
                "id": "j1",
                "job_number": "JOB-1",
                "status_job": "loading",
                "asal": "A",
                "tujuan": "B",
                "etd": "2026-10-01T01:00:00+00:00",
                "uang_jalan_awal": 1_000_000,
                "unit": {"kode_unit": "TH06"},
                "driver": {"nama": "Budi"},
                "proyek": {"customer": {"nama_perusahaan": "PT A"}},
                "uang_jalan": [
                    {"id": "u1", "jenis": "tambahan", "jumlah": 200_000, "tanggal": "2026-10-01", "status_approval": "menunggu"},
                    {"id": "u2", "jenis": "tambahan", "jumlah": 300_000, "tanggal": "2026-10-01", "status_approval": "disetujui"},
                ],
                "uang_jalan_requests": [
                    {"id": "r1", "status_pengajuan": "diajukan"},
                    {"id": "r2", "status_pengajuan": "dicairkan"},
                ],
            }
        ]
    )
    [baris] = await UangJalanService(db).list_jobs()  # type: ignore[arg-type]
    assert baris.pengajuan_menunggu == 1
    assert baris.tambahan_menunggu_approval == 1
