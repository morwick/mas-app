"""Penilaian kualitas foto lapangan (FR-PHOTO-05).

Ketajaman diukur dengan *variance of Laplacian*: gambar diubah abu-abu,
difilter kernel Laplacian, lalu dihitung variansinya. Tepi yang tajam
menghasilkan respons besar; foto buram nilainya kecil. Gambar diperkecil ke
lebar tetap dulu supaya skornya sebanding antar resolusi kamera.

Ini heuristik — hanya menandai `kualitas_rendah`, tidak menolak unggahan.
Ambang batas per slot dapat diatur lewat konfigurasi dan perlu dikalibrasi
dengan foto sungguhan dari HP driver.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter, ImageOps

ANALYSIS_WIDTH = 800

# Surat timbang adalah dokumen teks: harus lebih tajam daripada foto badan truk.
DEFAULT_THRESHOLDS: dict[str, float] = {
    "default": 60.0,
    "surat_timbang": 120.0,
}
MIN_BRIGHTNESS = 35.0
MAX_BRIGHTNESS = 225.0
MIN_SHORT_SIDE_PX = 1280


@dataclass(frozen=True)
class QualityReport:
    sharpness: float
    brightness: float
    width: int
    height: int
    kualitas_rendah: bool
    alasan: list[str]


def _laplacian_variance(gray: Image.Image) -> float:
    kernel = ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1, offset=128)
    filtered = np.asarray(gray.filter(kernel), dtype=np.float64) - 128.0
    return float(filtered.var())


def assess_photo(data: bytes, *, slot: str | None = None) -> QualityReport:
    with Image.open(io.BytesIO(data)) as raw:
        img = ImageOps.exif_transpose(raw) or raw
        width, height = img.size
        gray = img.convert("L")
        if gray.width > ANALYSIS_WIDTH:
            ratio = ANALYSIS_WIDTH / gray.width
            gray = gray.resize((ANALYSIS_WIDTH, max(1, int(gray.height * ratio))))
        sharpness = _laplacian_variance(gray)
        brightness = float(np.asarray(gray, dtype=np.float64).mean())

    threshold = DEFAULT_THRESHOLDS.get(slot or "", DEFAULT_THRESHOLDS["default"])
    alasan: list[str] = []
    if sharpness < threshold:
        alasan.append("buram")
    if brightness < MIN_BRIGHTNESS:
        alasan.append("terlalu gelap")
    elif brightness > MAX_BRIGHTNESS:
        alasan.append("terlalu terang")
    if min(width, height) < MIN_SHORT_SIDE_PX:
        alasan.append("resolusi rendah")

    return QualityReport(
        sharpness=round(sharpness, 2),
        brightness=round(brightness, 1),
        width=width,
        height=height,
        kualitas_rendah=bool(alasan),
        alasan=alasan,
    )


def assess_photo_safely(data: bytes, *, slot: str | None = None) -> QualityReport | None:
    """None bila berkas bukan gambar yang bisa dibaca — jangan gagalkan unggahan."""
    try:
        return assess_photo(data, slot=slot)
    except Exception:  # noqa: BLE001
        return None
