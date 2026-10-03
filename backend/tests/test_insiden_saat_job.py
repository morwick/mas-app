"""Insiden saat unit bertugas & insiden dari ganti unit.

Aturan:
- insiden unit yang sedang bertugas otomatis dikaitkan ke job aktifnya (job_id);
- insiden dari pergantian unit (ganti_unit_id terisi) tidak bisa dihapus;
  insiden operator yang hanya terkait job tetap boleh dihapus;
- Ganti unit memakai insiden terdaftar (insiden_id) atau mencatat insiden baru.

Tiap aturan diuji skenario sukses, edge, dan gagal.
"""

from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.core.errors import NotFoundError, ValidationError
from app.modules.incidents.schemas import IncidentCreate
from app.modules.incidents.service import IncidentService, to_incident
from app.modules.jobs import service as job_service
from app.modules.jobs.schemas import GantiTrailerRequest, GantiUnitRequest
from app.modules.jobs.service import JobService

# ── Pembantu ────────────────────────────────────────────────────────────────


class _Db:
    """Data per tabel. Mencatat insert/update/rpc dan tabel yang di-query."""

    def __init__(self, data: dict[str, Any] | None = None, *, rpc_hasil: Any = None) -> None:
        self.data = data or {}
        self.rpc_hasil = rpc_hasil
        self._tabel = ""
        self._rpc = False
        self.query: list[str] = []
        self.ditambah: list[dict[str, Any]] = []
        self.diubah: list[dict[str, Any]] = []
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def table(self, nama: str) -> "_Db":
        self._tabel, self._rpc = nama, False
        self.query.append(nama)
        return self

    def insert(self, data: dict[str, Any]) -> "_Db":
        self.ditambah.append(data)
        return self

    def update(self, data: dict[str, Any]) -> "_Db":
        self.diubah.append(data)
        return self

    def rpc(self, nama: str, params: dict[str, Any]) -> "_Db":
        self.rpc_calls.append((nama, params))
        self._rpc = True
        return self

    @property
    def not_(self) -> "_Db":
        return self

    def __getattr__(self, _nama: str) -> Any:
        # select / eq / in_ / order / limit / maybe_single → rantai saja.
        return lambda *_a, **_k: self

    async def execute(self) -> SimpleNamespace:
        if self._rpc:
            return SimpleNamespace(data=self.rpc_hasil)
        return SimpleNamespace(data=self.data.get(self._tabel))


INSIDEN_DASAR = {
    "id": "i1",
    "tipe": "kerusakan",
    "tanggal": "2026-10-03T01:00:00Z",
    "deskripsi": "Ban pecah",
    "status_penanganan": "open",
    "created_at": "2026-10-03T01:00:00Z",
}


def _create(**isi: Any) -> IncidentCreate:
    return IncidentCreate(
        **{
            "unit_id": "u1",
            "tipe": "kerusakan",
            "tanggal": "2026-10-03T08:00:00+07:00",
            "deskripsi": "Ban pecah",
            **isi,
        }
    )


async def _buat(db: _Db, payload: IncidentCreate, monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Jalankan create; `get` setelah insert diganti supaya fokus ke isian insert."""

    async def get(self: IncidentService, incident_id: str) -> Any:
        return incident_id

    monkeypatch.setattr(IncidentService, "get", get)
    db.data.setdefault("incident_logs", [{"id": "i-baru"}])
    await IncidentService(db).create(payload, created_by="p1")  # type: ignore[arg-type]
    return db.ditambah[0]


# ── 1. Catat insiden: dikaitkan ke job aktif ────────────────────────────────


async def test_sukses_unit_bertugas_insiden_dikaitkan_ke_job_aktif(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _Db({"jobs": [{"id": "j-aktif"}]})
    baris = await _buat(db, _create(), monkeypatch)
    assert baris["job_id"] == "j-aktif"
    assert baris["unit_id"] == "u1" and baris["deskripsi"] == "Ban pecah"


async def test_sukses_unit_standby_insiden_tanpa_job(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _Db({"jobs": []})
    baris = await _buat(db, _create(), monkeypatch)
    assert baris["job_id"] is None


async def test_edge_insiden_unit_trailer_tidak_mencari_job(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _Db({"jobs": [{"id": "j-aktif"}]})
    baris = await _buat(db, _create(unit_id=None, unit_trailer_id="t1"), monkeypatch)
    assert baris["job_id"] is None
    assert "jobs" not in db.query


def test_edge_job_tidak_bisa_dipilih_pengguna() -> None:
    # Field job_id dari pengguna diabaikan — tidak ada di skema isian.
    assert "job_id" not in IncidentCreate.model_fields
    assert "job_id" not in _create(job_id="j-palsu").model_dump()


async def test_gagal_deskripsi_kosong_tidak_menyimpan(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _Db({"jobs": [{"id": "j-aktif"}]})
    with pytest.raises(ValidationError, match="Deskripsi wajib"):
        await IncidentService(db).create(_create(deskripsi="   "), created_by="p1")  # type: ignore[arg-type]
    assert db.ditambah == []


def test_gagal_insiden_tanpa_aset_atau_dua_aset() -> None:
    with pytest.raises(PydanticValidationError, match="satu unit atau satu unit trailer"):
        _create(unit_id=None)
    with pytest.raises(PydanticValidationError, match="satu unit atau satu unit trailer"):
        _create(unit_trailer_id="t1")


# ── 2. Hapus insiden ────────────────────────────────────────────────────────


async def test_sukses_hapus_insiden_operator_yang_terkait_job() -> None:
    db = _Db({"incident_logs": {"ganti_unit_id": None}})
    await IncidentService(db).delete("i1")  # type: ignore[arg-type]
    assert db.diubah == [{"status": 2}]


async def test_gagal_hapus_insiden_dari_ganti_unit() -> None:
    db = _Db({"incident_logs": {"ganti_unit_id": "g1"}})
    with pytest.raises(ValidationError, match="pergantian unit di job dan tidak bisa dihapus"):
        await IncidentService(db).delete("i1")  # type: ignore[arg-type]
    assert db.diubah == []


async def test_gagal_hapus_insiden_tidak_ada() -> None:
    db = _Db({"incident_logs": None})
    with pytest.raises(NotFoundError):
        await IncidentService(db).delete("i-hilang")  # type: ignore[arg-type]
    assert db.diubah == []


def test_edge_penanda_dari_ganti_unit() -> None:
    assert to_incident({**INSIDEN_DASAR, "ganti_unit_id": "g1", "job_id": "j1"}).dari_ganti_unit is True
    # Terkait job tapi bukan dari ganti unit → bukan insiden ganti unit.
    assert to_incident({**INSIDEN_DASAR, "job_id": "j1"}).dari_ganti_unit is False
    assert to_incident(INSIDEN_DASAR).dari_ganti_unit is False


# ── 3. Isian Ganti unit: insiden terdaftar atau baru ────────────────────────

GANTI = {"unit_id": "u2", "driver_id": "d2", "etd": "2099-01-01T08:00", "uang_jalan_awal": 1500000, "alasan": "Rusak"}


def test_sukses_pakai_insiden_terdaftar_tanpa_isian_insiden() -> None:
    req = GantiUnitRequest(**GANTI, insiden_id="i1")
    assert req.insiden_id == "i1" and req.insiden_tanggal is None and req.insiden_deskripsi is None


def test_sukses_insiden_baru_dengan_tanggal_dan_deskripsi() -> None:
    req = GantiUnitRequest(**GANTI, insiden_tanggal="2099-01-01T07:00", insiden_deskripsi=" Gardan patah ")
    assert req.insiden_id is None and req.insiden_deskripsi == "Gardan patah"


def test_gagal_tanpa_insiden_terdaftar_maupun_isian() -> None:
    with pytest.raises(PydanticValidationError, match="Pilih insiden yang sudah terdaftar"):
        GantiUnitRequest(**GANTI)


def test_edge_isian_spasi_dianggap_kosong() -> None:
    with pytest.raises(PydanticValidationError, match="Pilih insiden yang sudah terdaftar"):
        GantiUnitRequest(**GANTI, insiden_id="  ", insiden_tanggal="2099-01-01T07:00", insiden_deskripsi="   ")


def test_gagal_insiden_baru_tanpa_tanggal() -> None:
    with pytest.raises(PydanticValidationError, match="Pilih insiden yang sudah terdaftar"):
        GantiUnitRequest(**GANTI, insiden_deskripsi="Gardan patah")


def test_edge_ganti_trailer_tetap_wajib_isian_insiden() -> None:
    # Ganti unit trailer tidak memakai insiden terdaftar — deskripsi tetap wajib.
    with pytest.raises(PydanticValidationError):
        GantiTrailerRequest(unit_trailer_id="t2", alasan="Rusak", insiden_tanggal="2099-01-01T07:00")


# ── 4. Ganti unit meneruskan insiden ke database ────────────────────────────

JOB_LAMA = {
    "id": "j1",
    "job_number": "JOB-1",
    "driver_id": "d1",
    "proyek_id": "pr1",
    "alat_diangkut": "Excavator",
    "asal": "A",
    "tujuan": "B",
    "etd": "2098-12-31T01:00:00+00:00",
}


@pytest.fixture
def ganti_siap(monkeypatch: pytest.MonkeyPatch) -> None:
    """Persiapan job pengganti & push driver dipalsukan — fokus ke parameter RPC."""

    async def siapkan(self: JobService, payload: Any, **_: Any) -> dict[str, Any]:
        return {"unit_id": payload.unit_id}

    async def kabari(self: JobService, *_: Any) -> None:
        return None

    async def push(*_: Any, **__: Any) -> None:
        return None

    monkeypatch.setattr(JobService, "siapkan_baris", siapkan)
    monkeypatch.setattr(JobService, "kabari_driver", kabari)
    monkeypatch.setattr(job_service, "push_to_driver", push)


def _db_ganti() -> _Db:
    return _Db({"jobs": JOB_LAMA}, rpc_hasil="j2")


async def _ganti(db: _Db, req: GantiUnitRequest) -> dict[str, Any]:
    # Select job pengganti setelah RPC juga membaca tabel jobs → beri data job baru.
    asli = db.execute

    async def execute() -> SimpleNamespace:
        hasil = await asli()
        if not db._rpc and len(db.rpc_calls) > 0:
            return SimpleNamespace(data={"id": "j2", "job_number": "JOB-2", "share_token": "t"})
        return hasil

    db.execute = execute  # type: ignore[method-assign]
    await JobService(db).ganti_unit("j1", req, created_by="p1")  # type: ignore[arg-type]
    nama, params = db.rpc_calls[0]
    assert nama == "ganti_unit_job_baru"
    return params


@pytest.mark.usefixtures("ganti_siap")
async def test_sukses_ganti_unit_memakai_insiden_terdaftar() -> None:
    params = await _ganti(_db_ganti(), GantiUnitRequest(**GANTI, insiden_id="i1"))
    assert params["p_insiden_id"] == "i1"
    assert params["p_insiden_tanggal"] is None and params["p_insiden_deskripsi"] is None


@pytest.mark.usefixtures("ganti_siap")
async def test_sukses_ganti_unit_mencatat_insiden_baru() -> None:
    req = GantiUnitRequest(
        **GANTI, insiden_tanggal="2099-01-01T00:00:00Z", insiden_lokasi="  KM 120 ", insiden_deskripsi="Gardan patah"
    )
    params = await _ganti(_db_ganti(), req)
    assert params["p_insiden_id"] is None
    assert params["p_insiden_tanggal"].startswith("2099-01-01T00:00:00")
    assert params["p_insiden_lokasi"] == "KM 120" and params["p_insiden_deskripsi"] == "Gardan patah"


@pytest.mark.usefixtures("ganti_siap")
async def test_edge_insiden_terdaftar_mengabaikan_isian_insiden_baru() -> None:
    req = GantiUnitRequest(
        **GANTI, insiden_id="i1", insiden_tanggal="2099-01-01T00:00:00Z", insiden_deskripsi="Isian lain"
    )
    params = await _ganti(_db_ganti(), req)
    assert params["p_insiden_id"] == "i1"
    assert params["p_insiden_tanggal"] is None and params["p_insiden_deskripsi"] is None


async def test_gagal_etd_pengganti_lebih_awal_tidak_memanggil_database() -> None:
    db = _Db({"jobs": {**JOB_LAMA, "etd": "2099-01-05T01:00:00+00:00"}})
    req = GantiUnitRequest(**{**GANTI, "etd": "2099-01-04T08:00:00+07:00"}, insiden_id="i1")
    with pytest.raises(ValidationError, match="tidak boleh lebih awal dari ETD job awal JOB-1"):
        await JobService(db).ganti_unit("j1", req, created_by="p1")  # type: ignore[arg-type]
    assert db.rpc_calls == []
