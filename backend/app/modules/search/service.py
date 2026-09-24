"""Pencarian global lintas entitas untuk kotak cari di top bar.

Setiap entitas dicari terpisah lalu digabung. Batasnya kecil per entitas
supaya satu jenis data tidak menenggelamkan yang lain, dan supaya query-nya
tetap ringan — ini dipanggil pada tiap ketikan.

RLS tetap berlaku: klien yang dipakai adalah klien user yang login, jadi
operator hanya menemukan data yang memang boleh ia lihat.
"""

from __future__ import annotations

import asyncio
from typing import Any

from supabase import AsyncClient

from app.core.paging import ilike_any
from app.core.pg import rows
from app.modules.search.schemas import SearchHit, SearchResponse

# Jumlah hasil per entitas. Kecil dan disengaja: kotak cari adalah jalan pintas
# menuju satu data, bukan pengganti halaman daftar yang sudah punya filter.
PER_KIND_LIMIT = 5

# Panjang minimum sebelum query dijalankan — satu huruf akan cocok dengan
# hampir semua baris dan hasilnya tidak berguna.
MIN_QUERY_LENGTH = 2


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _join(*parts: Any) -> str | None:
    kept = [p for p in (_text(x) for x in parts) if p]
    return " · ".join(kept) or None


class SearchService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    async def _query(self, table: str, select: str, columns: list[str], term: str) -> list[dict[str, Any]]:
        res = await self._db.table(table).select(select).or_(ilike_any(columns, term)).limit(PER_KIND_LIMIT).execute()
        return rows(res)

    async def search(self, term: str) -> SearchResponse:
        cleaned = (term or "").strip()
        if len(cleaned) < MIN_QUERY_LENGTH:
            return SearchResponse(query=cleaned, hits=[])

        jobs, units, drivers, customers, quotations = await asyncio.gather(
            # `customer_nama` bukan kolom jobs melainkan hasil embed, dan
            # PostgREST tidak bisa menggabungkannya ke dalam satu grup `or=`
            # bersama kolom sendiri. Job dicari lewat kolomnya saja; pencarian
            # berdasarkan nama customer terwakili oleh hasil entitas customer.
            self._query(
                "jobs",
                "id, job_number, alat_diangkut, status_job, customer:customers(nama_perusahaan)",
                ["job_number", "alat_diangkut", "asal", "tujuan"],
                cleaned,
            ),
            self._query(
                "units",
                "id, kode_unit, no_polisi, status_operasional, jenis_unit:jenis_unit_id(nama)",
                ["kode_unit", "no_polisi"],
                cleaned,
            ),
            self._query("drivers", "id, nama, no_hp, is_active", ["nama", "no_hp"], cleaned),
            self._query(
                "customers",
                "id, nama_perusahaan, kota, pic_nama, is_active",
                ["nama_perusahaan", "kota", "pic_nama"],
                cleaned,
            ),
            self._query(
                "quotations",
                "id, quote_number, customer_nama, status_penawaran",
                ["quote_number", "customer_nama"],
                cleaned,
            ),
        )

        hits: list[SearchHit] = []
        for r in jobs:
            cust = r.get("customer") or {}
            nama_cust = cust.get("nama_perusahaan") if isinstance(cust, dict) else None
            hits.append(
                SearchHit(
                    kind="job",
                    id=r["id"],
                    label=r["job_number"],
                    sublabel=_join(nama_cust, r.get("alat_diangkut")),
                    href=f"/jobs/{r['id']}",
                )
            )
        for r in units:
            jenis = r.get("jenis_unit") or {}
            nama_jenis = jenis.get("nama") if isinstance(jenis, dict) else None
            hits.append(
                SearchHit(
                    kind="unit",
                    id=r["id"],
                    label=r["kode_unit"],
                    sublabel=_join(nama_jenis, r.get("no_polisi")),
                    href=f"/units/{r['id']}",
                )
            )
        for r in drivers:
            hits.append(
                SearchHit(
                    kind="driver",
                    id=r["id"],
                    label=r["nama"],
                    sublabel=_join(r.get("no_hp"), None if r.get("is_active", True) else "nonaktif"),
                    href=f"/drivers/{r['id']}/edit",
                )
            )
        for r in customers:
            hits.append(
                SearchHit(
                    kind="customer",
                    id=r["id"],
                    label=r["nama_perusahaan"],
                    sublabel=_join(r.get("kota"), r.get("pic_nama")),
                    href=f"/customers/{r['id']}/edit",
                )
            )
        for r in quotations:
            hits.append(
                SearchHit(
                    kind="quotation",
                    id=r["id"],
                    label=r["quote_number"],
                    sublabel=_join(r.get("customer_nama"), r.get("status_penawaran")),
                    href=f"/quotations/{r['id']}",
                )
            )

        return SearchResponse(query=cleaned, hits=hits)
