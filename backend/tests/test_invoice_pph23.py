"""Potongan PPh 23 di tagihan: default mati, persen 0–100, ikut tersimpan di header."""

import pytest

from app.core.errors import ValidationError
from app.modules.invoices.schemas import InvoiceInput, InvoiceItemInput
from app.modules.invoices.service import _header_payload, _validate


def _payload(**kw: object) -> InvoiceInput:
    return InvoiceInput(
        customer_id="c1",
        kota_terbit="Pekanbaru",
        tanggal="2026-10-03",
        items=[InvoiceItemInput(deskripsi="Angkut", qty=1, harga_satuan=10_000_000)],
        **kw,  # type: ignore[arg-type]
    )


def test_default_tanpa_pph23_dengan_persen_2() -> None:
    p = _payload()
    assert (p.pph23_aktif, p.pph23_persen) == (False, 2)
    header = _header_payload(p, termin=30)
    assert (header["pph23_aktif"], header["pph23_persen"]) == (False, 2)


def test_pph23_aktif_tersimpan_di_header() -> None:
    p = _payload(ppn_aktif=True, pph23_aktif=True, pph23_persen=2)
    _validate(p)
    header = _header_payload(p, termin=30)
    assert (header["ppn_aktif"], header["pph23_aktif"], header["pph23_persen"]) == (True, True, 2)


@pytest.mark.parametrize("persen", [-1, 101])
def test_persen_pph23_di_luar_batas_ditolak(persen: float) -> None:
    with pytest.raises(ValidationError, match="PPh 23"):
        _validate(_payload(pph23_aktif=True, pph23_persen=persen))


def test_persen_tidak_dicek_bila_pph23_mati() -> None:
    _validate(_payload(pph23_aktif=False, pph23_persen=500))
