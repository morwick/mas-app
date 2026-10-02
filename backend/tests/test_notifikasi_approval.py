"""Notifikasi keputusan approval (migration 20261001000020) dikenali lonceng."""

from app.modules.notifications.service import _to_notifications


def test_jenis_approval_dikenali_dengan_tingkat_yang_sesuai() -> None:
    raw = [
        {"id": "n1", "kind": "approval_disetujui", "title": "Tambahan uang jalan disetujui", "body": "x",
         "href": "/jobs/j1", "created_at": "2026-10-02T01:00:00Z", "notification_reads": []},
        {"id": "n2", "kind": "approval_ditolak", "title": "Penjualan aset ditolak", "body": "y",
         "href": "/penjualan-unit", "created_at": "2026-10-02T02:00:00Z", "notification_reads": [{"user_id": "u1"}]},
    ]
    a, b = _to_notifications(raw, "u1")
    assert (a.kind, a.severity, a.read) == ("approval_disetujui", "info", False)
    assert (b.kind, b.severity, b.read) == ("approval_ditolak", "danger", True)
