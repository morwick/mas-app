"""Surat jalan dipisah per tahap: saat loading & saat unloading."""

from app.modules.invoices.service import _surat_jalan


def test_dipisah_per_tahap() -> None:
    foto = [
        {"file_path": "j1/loading.jpg", "stage": "loading"},
        {"file_path": "j1/unloading.jpg", "stage": "unloading"},
    ]
    hasil = _surat_jalan(foto, "job-photos")
    assert len(hasil["surat_jalan_urls"]) == 2
    assert [u.endswith("loading.jpg") and "unloading" not in u for u in hasil["surat_jalan_loading_urls"]] == [True]
    assert [u.endswith("unloading.jpg") for u in hasil["surat_jalan_unloading_urls"]] == [True]


def test_transaksi_uang_jalan_urut_dengan_bukti() -> None:
    from app.modules.invoices.service import _transaksi

    transaksi = [
        {"jenis": "penambahan_pagu", "jumlah": "500000", "tanggal": "2026-09-12", "keperluan": "Tol tambahan"},
        {"jenis": "pencairan", "jumlah": "1500000", "tanggal": "2026-09-10", "bukti_transfer_path": "j1/tf.jpg"},
    ]
    hasil = _transaksi(transaksi, {"j1/tf.jpg": "https://signed/tf.jpg"})
    assert [(t.jenis, t.jumlah, t.bukti_url) for t in hasil] == [
        ("pencairan", 1_500_000, "https://signed/tf.jpg"),
        ("penambahan_pagu", 500_000, None),
    ]
    assert hasil[1].keterangan == "Tol tambahan"
