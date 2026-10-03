"""Detail proyek: uang jalan (cair / uang jalan job) & total biaya lain tiap job,
dihitung sama dengan kartu Uang jalan di detail job."""

from types import SimpleNamespace
from typing import Any

from app.modules.proyek.service import ProyekService


class _Db:
    def __init__(self, data: dict[str, list[dict[str, Any]]]) -> None:
        self.data = data
        self.tabel = ""

    def table(self, nama: str) -> "_Db":
        self.tabel = nama
        return self

    def select(self, *_: object) -> "_Db":
        return self

    def in_(self, *_: object) -> "_Db":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data.get(self.tabel, []))


def _svc(data: dict[str, list[dict[str, Any]]]) -> ProyekService:
    svc = ProyekService.__new__(ProyekService)
    svc._db = _Db(data)  # type: ignore[assignment]
    return svc


def _job(id_: str, awal: float) -> Any:
    return SimpleNamespace(id=id_, uang_jalan_awal=awal)


async def test_uang_jalan_dan_biaya_lain_per_job() -> None:
    data = {
        "uang_jalan": [
            {"job_id": "j1", "jenis": "pencairan", "jumlah": 1_500_000, "status_approval": "disetujui"},
            {"job_id": "j1", "jenis": "tambahan", "jumlah": 500_000, "status_approval": "disetujui"},
            # Tambahan menunggu belum masuk uang jalan; kasbon tidak mengurangi cair.
            {"job_id": "j1", "jenis": "tambahan", "jumlah": 300_000, "status_approval": "menunggu"},
            {"job_id": "j1", "jenis": "kasbon", "jumlah": 100_000, "status_approval": "disetujui"},
            {"job_id": "j1", "jenis": "pengembalian", "jumlah": 200_000, "status_approval": "disetujui"},
        ],
        "biaya_lain": [{"job_id": "j1", "nominal": 25_000}, {"job_id": "j1", "nominal": 5_000}],
    }
    hasil = await _svc(data)._biaya_job([_job("j1", 2_000_000), _job("j2", 1_000_000)])
    j1 = hasil["j1"]
    assert (j1.uang_jalan, j1.cair, j1.sisa, j1.biaya_lain) == (2_500_000, 1_300_000, 1_200_000, 30_000)
    # Job tanpa transaksi: uang jalan = awal, belum cair, tanpa biaya lain.
    j2 = hasil["j2"]
    assert (j2.uang_jalan, j2.cair, j2.sisa, j2.biaya_lain) == (1_000_000, 0, 1_000_000, 0)


async def test_proyek_tanpa_job_kosong() -> None:
    assert await _svc({})._biaya_job([]) == {}
