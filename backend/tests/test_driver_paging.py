"""Batas halaman untuk gulir bertahap di aplikasi driver.

Aplikasi memuat daftar sepotong demi sepotong, jadi server harus benar-benar
memotong — bukan mengirim semuanya lalu dibuang klien. Batasnya juga dijaga
supaya satu permintaan tidak bisa menarik seluruh riwayat sekaligus.
"""

from typing import get_args

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError as PydanticValidationError

from app.core.paging import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PageParams
from app.modules.driver_portal.router import driver_page_params
from app.modules.driver_portal.schemas import DriverJobFilter


@pytest.fixture
def halaman() -> TestClient:
    """Rute telanjang yang hanya memakai dependensi halaman.

    Rute driver yang asli menolak dengan 401 sebelum sempat memvalidasi query,
    jadi batasnya diuji di sini supaya yang gagal benar-benar batas halamannya.
    """
    app = FastAPI()

    @app.get("/uji")
    def uji(params: PageParams = Depends(driver_page_params)) -> dict[str, int]:
        return {"page": params.page, "page_size": params.page_size}

    return TestClient(app)


def test_jendela_baris_mengikuti_halaman() -> None:
    # `.range()` PostgREST inklusif di kedua ujung.
    p = PageParams(page=3, page_size=20)
    assert (p.offset, p.last_index) == (40, 59)


def test_halaman_pertama_mulai_dari_nol() -> None:
    p = PageParams(page=1, page_size=20)
    assert (p.offset, p.last_index) == (0, 19)


def test_default_dua_puluh_baris() -> None:
    assert driver_page_params().page_size == DEFAULT_PAGE_SIZE == 20


def test_ukuran_halaman_dibatasi() -> None:
    assert MAX_PAGE_SIZE == 200


@pytest.mark.parametrize("page_size", [0, -1, -5, 201, 5000])
def test_ukuran_di_luar_batas_ditolak(halaman: TestClient, page_size: int) -> None:
    # Termasuk -1: "tampilkan semua" sengaja tidak dibuka untuk driver.
    assert halaman.get("/uji", params={"page_size": page_size}).status_code == 422


@pytest.mark.parametrize("page", [0, -1])
def test_nomor_halaman_harus_mulai_dari_satu(halaman: TestClient, page: int) -> None:
    assert halaman.get("/uji", params={"page": page}).status_code == 422


@pytest.mark.parametrize("page_size", [1, 20, 200])
def test_ukuran_di_dalam_batas_diterima(halaman: TestClient, page_size: int) -> None:
    res = halaman.get("/uji", params={"page_size": page_size})
    assert res.status_code == 200
    assert res.json()["page_size"] == page_size


def test_tab_mobile_dikenali_sebagai_filter() -> None:
    # Tab disaring server; kalau nilainya tidak cocok, aplikasi diam-diam
    # menerima daftar yang salah.
    assert set(get_args(DriverJobFilter)) >= {"konfirmasi", "aktif", "selesai"}


def test_filter_lama_portal_web_tetap_ada() -> None:
    # Portal driver di web masih memakai keduanya.
    assert {"active", "all"} <= set(get_args(DriverJobFilter))


def test_page_params_menolak_ukuran_bukan_angka() -> None:
    with pytest.raises(PydanticValidationError):
        PageParams(page=1, page_size="banyak")  # type: ignore[arg-type]
