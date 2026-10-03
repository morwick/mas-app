"""Laporan laba tahunan: profit per bulan (omset − uang jalan − biaya lainnya),
porsi proyek kosongan, dan proyek selesai belum ditagih. Skenario sukses,
edge, dan gagal (data disaring)."""

from typing import Any

from app.modules.invoices.schemas import ProyekProfitabilityRow
from app.modules.reports.laba_tahunan import susun_belum_ditagih, susun_bulan


def _bulan(bulan: int, omset: float = 0, uang_jalan: float = 0, dibayar: float = 0, **kw: Any) -> dict[str, Any]:
    return {"bulan": bulan, "jumlah_tagihan": 1 if omset else 0, "jumlah_proyek": 1 if omset else 0,
            "omset": omset, "dibayar": dibayar, "uang_jalan": uang_jalan, **kw}  # fmt: skip


def _proyek(pid: str, **kw: Any) -> ProyekProfitabilityRow:
    dasar: dict[str, Any] = {
        "proyek_id": pid, "nomor_proyek": f"PRJ-{pid}", "customer_nama": "PT Uji", "unit_kode": "U-1",
        "etd_awal": "2026-01-05T00:00:00+07:00", "jumlah_job": 1, "semua_selesai": True, "pendapatan": 0,
        "uang_jalan": 300_000, "biaya_insiden": 0, "laba": -300_000,
    }  # fmt: skip
    return ProyekProfitabilityRow(**{**dasar, **kw})


def test_profit_dan_margin_per_bulan() -> None:
    r = susun_bulan([_bulan(1, omset=1_000_000, uang_jalan=250_000, dibayar=500_000, biaya_lainnya=50_000)])[0]
    assert (r.omset, r.uang_jalan, r.biaya_lainnya, r.dibayar) == (1_000_000, 250_000, 50_000, 500_000)
    assert r.profit == 700_000
    assert r.margin == 70.0


def test_bulan_tanpa_tagihan_margin_kosong() -> None:
    r = susun_bulan([_bulan(2)])[0]
    assert (r.profit, r.margin) == (0, None)


def test_bulan_rugi_margin_negatif() -> None:
    r = susun_bulan([_bulan(3, omset=100_000, uang_jalan=150_000)])[0]
    assert (r.profit, r.margin) == (-50_000, -50.0)


def test_bulan_hanya_kosongan_profit_negatif_tanpa_margin() -> None:
    # Kosongan bongkar Oktober: tanpa omset, biayanya tetap mengurangi profit.
    data = [_bulan(10, jumlah_kosongan=1, uang_jalan_kosongan=400_000, biaya_lainnya_kosongan=15_000)]
    r = susun_bulan(data)[0]
    assert (r.uang_jalan, r.uang_jalan_kosongan, r.jumlah_kosongan) == (400_000, 400_000, 1)
    assert (r.biaya_lainnya, r.biaya_lainnya_kosongan) == (15_000, 15_000)
    assert r.profit == -415_000
    assert r.margin is None


def test_total_gabungan_ditagih_dan_kosongan() -> None:
    data = [
        _bulan(
            1, omset=1_000_000, uang_jalan=250_000, biaya_lainnya=30_000,
            jumlah_kosongan=1, uang_jalan_kosongan=100_000, biaya_lainnya_kosongan=15_000,
        )
    ]  # fmt: skip
    r = susun_bulan(data)[0]
    assert (r.uang_jalan, r.biaya_lainnya) == (350_000, 45_000)
    # 1.000.000 − 350.000 − 45.000
    assert r.profit == 605_000


def test_belum_ditagih_hanya_proyek_selesai_tanpa_tagihan_dan_bukan_kosongan() -> None:
    hasil = susun_belum_ditagih(
        [
            _proyek("a"),
            _proyek("b", invoice_id="inv-1", invoice_number="INV/1"),  # sudah ditagih
            _proyek("c", semua_selesai=False),  # job belum selesai
            _proyek("d", kosongan=True),  # kosongan tidak ditagih
        ],
        {"a": 15_000, "b": 888_888},
    )
    assert [d.proyek_id for d in hasil.daftar] == ["a"]
    assert (hasil.jumlah, hasil.uang_jalan, hasil.biaya_lainnya) == (1, 300_000, 15_000)


def test_belum_ditagih_kosong() -> None:
    hasil = susun_belum_ditagih([], {})
    assert (hasil.jumlah, hasil.uang_jalan, hasil.biaya_lainnya, hasil.daftar) == (0, 0, 0, [])


def test_endpoint_tanpa_login_ditolak(client: Any) -> None:
    res = client.get("/api/reports/laba-tahunan", params={"tahun": 2026})
    assert res.status_code == 401
