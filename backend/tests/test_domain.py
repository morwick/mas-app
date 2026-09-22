"""Tes fungsi murni di lapisan domain dan integrasi (tanpa jaringan)."""

from datetime import date, datetime

from app.core.timeutil import UTC, WIB, next_day_midnight_wib_as_utc, parse_iso
from app.domain.job_conflicts import ConflictCandidate, ScheduledJob, find_job_conflicts
from app.domain.service_status import derive_service_status, format_km
from app.domain.uang_jalan import hitung_ringkasan
from app.integrations.routing.eta import compute_eta, haversine_km
from app.integrations.routing.polyline import decode_polyline
from app.integrations.tracksolid.parse_link import parse_tracking_input
from app.modules.invoices.service import derive_tampil, hitung_jatuh_tempo
from app.modules.quotations.service import derive_status


def _job(**over: object) -> ScheduledJob:
    base = dict(
        id="j1",
        job_number="JOB-001",
        customer_nama="PT A",
        unit_id="u1",
        driver_id="d1",
        etd="2026-09-22T08:00:00Z",
        eta="2026-09-22T18:00:00Z",
        status="menunggu_pickup",
    )
    base.update(over)
    return ScheduledJob(**base)  # type: ignore[arg-type]


class TestJobConflicts:
    def test_same_unit_overlapping_window(self) -> None:
        res = find_job_conflicts(
            ConflictCandidate(unit_id="u1", driver_id="d9", etd="2026-09-22T10:00:00Z"),
            [_job()],
        )
        assert res.has_any
        assert [c.reason for c in res.unit] == ["unit"]
        assert res.driver == []

    def test_both_unit_and_driver(self) -> None:
        res = find_job_conflicts(
            ConflictCandidate(unit_id="u1", driver_id="d1", etd="2026-09-22T10:00:00Z"),
            [_job()],
        )
        assert res.unit[0].reason == "both"
        assert len(res.driver) == 1

    def test_no_overlap_when_window_after_eta(self) -> None:
        res = find_job_conflicts(
            ConflictCandidate(unit_id="u1", driver_id="d1", etd="2026-09-22T19:00:00Z"),
            [_job()],
        )
        assert not res.has_any

    def test_eta_fallback_12_hours(self) -> None:
        # Job lain tanpa ETA dianggap berlangsung 12 jam sejak ETD.
        res = find_job_conflicts(
            ConflictCandidate(unit_id="u1", driver_id="d9", etd="2026-09-22T19:00:00Z"),
            [_job(eta=None)],
        )
        assert res.has_any
        res2 = find_job_conflicts(
            ConflictCandidate(unit_id="u1", driver_id="d9", etd="2026-09-22T20:30:00Z"),
            [_job(eta=None)],
        )
        assert not res2.has_any

    def test_excludes_self_and_finished_jobs(self) -> None:
        cand = ConflictCandidate(
            unit_id="u1", driver_id="d1", etd="2026-09-22T10:00:00Z", exclude_job_id="j1"
        )
        assert not find_job_conflicts(cand, [_job()]).has_any
        assert not find_job_conflicts(
            ConflictCandidate(unit_id="u1", driver_id="d1", etd="2026-09-22T10:00:00Z"),
            [_job(status="selesai")],
        ).has_any


class TestServiceStatus:
    def test_overdue_and_due_soon(self) -> None:
        overdue = derive_service_status(
            current_odometer_km=20_500, last_service_odometer_km=10_000, service_interval_km=10_000
        )
        assert overdue.status == "overdue"
        assert overdue.km_to_next_service == -500

        soon = derive_service_status(
            current_odometer_km=19_600, last_service_odometer_km=10_000, service_interval_km=10_000
        )
        assert soon.status == "mendekati"
        assert soon.progress_percent == 96

    def test_no_service_yet_uses_zero_baseline(self) -> None:
        ok = derive_service_status(
            current_odometer_km=1_000, last_service_odometer_km=None, service_interval_km=10_000
        )
        assert ok.status == "ok"
        assert ok.next_service_at_km == 10_000

    def test_format_km_indonesian_separator(self) -> None:
        assert format_km(12345.6) == "12.346 km"


class TestUangJalan:
    def test_ringkasan(self) -> None:
        from app.modules.uang_jalan.schemas import UangJalan

        tx = [
            UangJalan(id="1", job_id="j", jenis="pencairan", tanggal="2026-09-01", jumlah=500_000, created_at="x"),
            UangJalan(id="2", job_id="j", jenis="penambahan_pagu", tanggal="2026-09-02", jumlah=200_000, created_at="x"),
            UangJalan(id="3", job_id="j", jenis="pencairan", tanggal="2026-09-03", jumlah=300_000, created_at="x"),
        ]
        r = hitung_ringkasan(1_000_000, tx)
        assert r.pagu == 1_200_000
        assert r.cair == 800_000
        assert r.sisa == 400_000
        assert r.persen_cair == 67

    def test_zero_pagu(self) -> None:
        assert hitung_ringkasan(0, []).persen_cair == 0


class TestRouting:
    def test_polyline_roundtrip_known_sample(self) -> None:
        # Contoh dari dokumentasi Google.
        pts = decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")
        assert [(round(a, 5), round(b, 5)) for a, b in pts] == [
            (38.5, -120.2),
            (40.7, -120.95),
            (43.252, -126.453),
        ]

    def test_haversine_jakarta_bandung(self) -> None:
        km = haversine_km(-6.2088, 106.8456, -6.9175, 107.6191)
        assert 115 < km < 125

    def test_compute_eta_truck_at_midpoint(self) -> None:
        pts = decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")
        mid = pts[1]
        eta = compute_eta(
            truck_lat=mid[0],
            truck_lng=mid[1],
            polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@",
            route_distance_km=1000,
            route_duration_min=1000,  # 60 km/j
        )
        assert eta is not None
        assert eta.avg_speed_kmh == 60
        assert eta.remaining_km > 0


class TestTrackSolidLink:
    def test_raw_imei(self) -> None:
        r = parse_tracking_input(" 353701093101554 ")
        assert r.imei == "353701093101554" and r.share_link is None

    def test_link_with_hash_fragment(self) -> None:
        link = "https://www.tracksolidpro.com/resource/dev/index.html?t=1#/monitorTracking?imei=353701093101554&x="
        r = parse_tracking_input(link)
        assert r.imei == "353701093101554" and r.share_link == link

    def test_garbage(self) -> None:
        assert parse_tracking_input("bukan imei").imei is None


class TestDerivedStatuses:
    def test_quotation_expired_only_when_sent_and_past(self) -> None:
        assert derive_status("terkirim", "2000-01-01") == "kedaluwarsa"
        assert derive_status("terkirim", "2999-01-01") == "terkirim"
        assert derive_status("draft", "2000-01-01") == "draft"

    def test_invoice_overdue(self) -> None:
        status, hari = derive_tampil("terkirim", "2000-01-01")
        assert status == "jatuh_tempo" and hari is not None and hari > 9000
        assert derive_tampil("lunas", "2000-01-01") == ("lunas", None)

    def test_jatuh_tempo_from_termin(self) -> None:
        assert hitung_jatuh_tempo("2026-01-31", 30, None) == "2026-03-02"
        assert hitung_jatuh_tempo("2026-01-31", 30, "2026-02-10") == "2026-02-10"
        assert hitung_jatuh_tempo("2026-01-31", None, None) is None


class TestTimeUtil:
    def test_parse_iso_z_and_naive(self) -> None:
        assert parse_iso("2026-09-22T08:00:00Z") == datetime(2026, 9, 22, 8, tzinfo=UTC)
        assert parse_iso("2026-09-22T08:00:00").tzinfo is UTC

    def test_next_day_midnight_wib(self) -> None:
        dt = next_day_midnight_wib_as_utc(date(2026, 9, 22))
        assert dt == datetime(2026, 9, 23, 0, 0, tzinfo=WIB).astimezone(UTC)
        assert dt.hour == 17 and dt.day == 22
