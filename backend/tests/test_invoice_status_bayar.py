"""Status bayar tagihan: Unpaid → Partial Paid → Completed."""

from app.modules.invoices.service import status_bayar


def test_status_bayar() -> None:
    assert status_bayar(1_000_000, 0) == "unpaid"  # default: belum ada pembayaran
    assert status_bayar(1_000_000, 400_000) == "partial_paid"
    assert status_bayar(1_000_000, 1_000_000) == "completed"
    assert status_bayar(1_000_000, 1_200_000) == "completed"
    assert status_bayar(0, 0) == "unpaid"
