"""Monitoring servis (lewat jadwal & mendekati) tampil di dashboard, bukan notifikasi."""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest

from app.domain.service_status import WARNING_THRESHOLD_KM
from app.modules.dashboard.servis import monitoring_servis
from app.modules.maintenance.service import MaintenanceService
from app.modules.notifications.service import NotificationService
from app.modules.units.service import UnitService


class _Q:
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


DATA = {
    "units": [
        # Servis terakhir di 10.000 km, interval 10.000 → jadwal 20.000; kini 23.500.
        {"id": "u1", "kode_unit": "TR-01", "current_odometer_km": 23_500, "service_interval_km": 10_000},
        # Masih jauh dari jadwal.
        {"id": "u2", "kode_unit": "TR-02", "current_odometer_km": 12_000, "service_interval_km": 10_000},
        # Lewat 500 km.
        {"id": "u3", "kode_unit": "TR-03", "current_odometer_km": 10_500, "service_interval_km": 10_000},
        # Sisa sedikit menuju servis (masuk ambang peringatan).
        {
            "id": "u4",
            "kode_unit": "TR-04",
            "current_odometer_km": 10_000 - WARNING_THRESHOLD_KM / 2,
            "service_interval_km": 10_000,
        },
    ],
    "service_records": [{"unit_id": "u1", "odometer_km": 10_000}, {"unit_id": "u2", "odometer_km": 10_000}],
}


def _unit(uid: str, kode: str, odo: float, interval: float = 10_000, terakhir: float | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uid,
        kode_unit=kode,
        current_odometer_km=odo,
        service_interval_km=interval,
        last_service_odometer_km=terakhir,
    )


async def test_lewat_jadwal_dan_mendekati(monkeypatch: pytest.MonkeyPatch) -> None:
    # Sumber sama dengan menu Service: MaintenanceService.units_with_service().
    async def units_with_service(self: MaintenanceService) -> list[SimpleNamespace]:
        return [
            _unit("u1", "TR-01", 23_500, terakhir=10_000),  # jadwal 20.000 → lewat 3.500
            _unit("u2", "TR-02", 12_000, terakhir=10_000),  # masih jauh
            _unit("u3", "TR-03", 10_500),  # lewat 500
            _unit("u4", "TR-04", 10_000 - WARNING_THRESHOLD_KM / 2),  # mendekati
            _unit("u5", "TR-05", 99_999, interval=0),  # interval kosong → tidak dipantau
        ]

    monkeypatch.setattr(MaintenanceService, "units_with_service", units_with_service)
    hasil = await monitoring_servis(_Db({}))  # type: ignore[arg-type]
    assert [(s.kode_unit, s.km) for s in hasil.lewat_jadwal] == [("TR-01", 3_500), ("TR-03", 500)]
    assert [(s.kode_unit, s.km) for s in hasil.mendekati] == [("TR-04", WARNING_THRESHOLD_KM / 2)]
    assert hasil.lewat_jadwal[0].href == "/units/u1?tab=service"


async def test_unit_terjual_diafkirkan_tidak_dipantau(monkeypatch: pytest.MonkeyPatch) -> None:
    async def list_all(self: UnitService, *, include_inactive: bool = False) -> list[SimpleNamespace]:
        return [
            SimpleNamespace(id=f"u{i}", status=st, model_dump=lambda st=st, i=i: {"id": f"u{i}", "status": st})
            for i, st in enumerate(["standby", "terjual", "diafkirkan", "bertugas"])
        ]

    monkeypatch.setattr(UnitService, "list_all", list_all)
    monkeypatch.setattr(MaintenanceService, "last_service_odometer_map", lambda self, ids: _kosong())
    monkeypatch.setattr("app.modules.maintenance.service.UnitWithService", lambda **kw: SimpleNamespace(**kw))
    hasil = await MaintenanceService(_Db({})).units_with_service()  # type: ignore[arg-type]
    assert [u.status for u in hasil] == ["standby", "bertugas"]


async def _kosong() -> dict[str, float]:
    return {}


async def test_servis_bukan_notifikasi() -> None:
    hasil = await NotificationService(_Db(DATA)).build(now=datetime(2026, 9, 26, tzinfo=UTC))  # type: ignore[arg-type]
    assert not any(n.kind in ("service_overdue", "service_due_soon") for n in hasil)
