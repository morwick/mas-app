"""Slot foto 'surat_timbang' sudah diganti 'surat_jalan'; nilai lama tetap diterima."""

from app.core.image_quality import DEFAULT_THRESHOLDS
from app.modules.jobs.schemas import REQUIRED_SLOTS, normalisasi_slot


def test_slot_lama_dinormalkan() -> None:
    assert normalisasi_slot("surat_timbang") == "surat_jalan"
    assert normalisasi_slot("surat_jalan") == "surat_jalan"
    assert normalisasi_slot("depan") == "depan"


def test_slot_wajib_dan_ambang_memakai_kode_baru() -> None:
    assert REQUIRED_SLOTS["loading"][-1] == "surat_jalan"
    assert REQUIRED_SLOTS["unloading"][-1] == "surat_jalan"
    assert DEFAULT_THRESHOLDS["surat_jalan"] > DEFAULT_THRESHOLDS["default"]
