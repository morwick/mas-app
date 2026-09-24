"""Klien data: select selalu `status = 1`, delete berubah jadi soft delete."""

from app.core.soft_delete import DataClient


def _client() -> DataClient:
    return DataClient("https://example.supabase.co", "anon-key")


def _params(builder: object) -> str:
    return str(builder.request.params)  # type: ignore[attr-defined]


def test_select_filters_active_rows() -> None:
    q = _client().table("units").select("id, kode_unit").eq("id", "u1")
    assert q.request.http_method.value == "GET"
    assert "status=eq.1" in _params(q)
    assert "id=eq.u1" in _params(q)


def test_delete_becomes_update_status_2() -> None:
    q = _client().table("jenis_unit").delete().eq("id", "j1")
    assert q.request.http_method.value == "PATCH"
    assert q.request.json == {"status": 2}
    assert "status=eq.1" in _params(q)
    assert "id=eq.j1" in _params(q)


def test_update_only_touches_active_rows() -> None:
    q = _client().table("customers").update({"nama_perusahaan": "PT X"}).eq("id", "c1")
    assert q.request.http_method.value == "PATCH"
    assert q.request.json == {"nama_perusahaan": "PT X"}
    assert "status=eq.1" in _params(q)


def test_insert_is_untouched() -> None:
    q = _client().table("drivers").insert({"nama": "A"})
    assert q.request.http_method.value == "POST"
    assert "status" not in _params(q)
