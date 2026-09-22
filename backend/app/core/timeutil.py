"""Bantuan tanggal/waktu. Semua "hari ini" mengikuti Waktu Indonesia Barat.

Server bisa berjalan di UTC, sedangkan bagi admin di Pekanbaru hari berganti
pukul 00:00 WIB — tanpa penyesuaian ini penawaran yang berlaku sampai hari ini
akan terbaca kedaluwarsa sejak pukul 07:00.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone

WIB = timezone(timedelta(hours=7), name="WIB")

ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]


def now_utc() -> datetime:
    return datetime.now(UTC)


def now_wib() -> datetime:
    return datetime.now(WIB)


def today_wib() -> date:
    return now_wib().date()


def today_wib_str() -> str:
    return today_wib().isoformat()


def iso_utc(dt: datetime | None = None) -> str:
    """ISO 8601 dengan sufiks Z, cocok dengan yang dihasilkan JavaScript."""
    d = dt or now_utc()
    return d.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    """Terima ISO dengan atau tanpa zona; tanpa zona dianggap UTC (seperti `new Date()` di server)."""
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


def parse_date(value: str) -> date:
    return date.fromisoformat(value[:10])


def roman_month(month: int) -> str:
    return ROMAN_MONTHS[month - 1]


def add_days(d: date, n: int) -> date:
    return d + timedelta(days=n)


def date_range_inclusive(start: date, end: date) -> list[date]:
    if end < start:
        return []
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def next_day_midnight_wib_as_utc(d: date) -> datetime:
    """(tanggal + 1 hari) 00:00 WIB, dinyatakan dalam UTC."""
    return datetime.combine(d + timedelta(days=1), datetime.min.time(), tzinfo=WIB).astimezone(UTC)
