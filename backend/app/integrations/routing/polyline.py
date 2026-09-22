"""Decode Google encoded polyline → daftar (lat, lng).

https://developers.google.com/maps/documentation/utilities/polylinealgorithm
"""

from __future__ import annotations


def decode_polyline(encoded: str) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    index = 0
    lat = 0
    lng = 0
    length = len(encoded)

    def _read() -> int:
        nonlocal index
        shift = 0
        result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        return ~(result >> 1) if result & 1 else result >> 1

    while index < length:
        lat += _read()
        lng += _read()
        points.append((lat / 1e5, lng / 1e5))
    return points
