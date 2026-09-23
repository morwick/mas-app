"""Fondasi pagination sisi server: jendela baris, bentuk respons, dan
pengamanan istilah pencarian."""

import pytest

from app.core.paging import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    Page,
    PageParams,
    build_page,
    escape_like,
    ilike_any,
    page_params,
)


def test_window_halaman_pertama() -> None:
    p = PageParams(page=1, page_size=20)
    assert (p.offset, p.last_index) == (0, 19)


def test_window_halaman_berikutnya() -> None:
    p = PageParams(page=3, page_size=20)
    # .range() PostgREST inklusif di kedua ujung, jadi 40..59 = 20 baris.
    assert (p.offset, p.last_index) == (40, 59)
    assert p.last_index - p.offset + 1 == 20


def test_page_size_selain_default() -> None:
    p = PageParams(page=2, page_size=15)
    assert (p.offset, p.last_index) == (15, 29)


def test_build_page_memakai_count_server() -> None:
    page = build_page([1, 2, 3], 137, PageParams(page=2, page_size=3))
    assert page.total == 137 and page.page == 2 and page.page_size == 3
    assert page.items == [1, 2, 3]


def test_build_page_tanpa_count_tidak_melaporkan_nol() -> None:
    """PostgREST mengembalikan None bila header count tidak terkirim; melaporkan
    0 akan membuat klien mengira datanya kosong."""
    page = build_page([1, 2], None, PageParams())
    assert page.total == 2


def test_build_page_kosong() -> None:
    page = build_page([], 0, PageParams())
    assert page.items == [] and page.total == 0


def test_escape_like_menetralkan_wildcard() -> None:
    # Tanpa ini, '%' cocok dengan semua baris.
    assert escape_like("50%") == "50\%"
    assert escape_like("a_b") == "a\_b"
    # Koma memecah daftar or=(...) PostgREST jadi kondisi tambahan.
    assert "," not in escape_like("a,b")


def test_ilike_any_merangkai_semua_kolom() -> None:
    out = ilike_any(["nama", "no_hp"], "budi")
    assert out == "nama.ilike.%budi%,no_hp.ilike.%budi%"


def test_ilike_any_ikut_mengamankan_term() -> None:
    out = ilike_any(["nama"], "100%")
    assert out == "nama.ilike.%100\%%"


def test_page_params_query_default() -> None:
    p = page_params()
    assert p.page == 1 and p.page_size == DEFAULT_PAGE_SIZE


def test_page_generic_menjaga_tipe_item() -> None:
    page = Page[str](items=["a"], total=1)
    assert page.items == ["a"]


@pytest.mark.parametrize("size", [1, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE])
def test_window_tidak_pernah_negatif(size: int) -> None:
    p = PageParams(page=1, page_size=size)
    assert p.offset == 0 and p.last_index == size - 1
