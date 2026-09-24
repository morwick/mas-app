from __future__ import annotations

from collections import Counter
from typing import Any

from postgrest.types import CountMethod
from supabase import AsyncClient

from app.core.errors import NotFoundError, ValidationError
from app.core.paging import Page, PageParams, apply_window, build_page, ilike_any
from app.core.pg import clean_text, rows, single
from app.modules.customers.schemas import Customer, CustomerCreate, CustomerUpdate

# Field opsional bertipe teks — dinormalkan seragam ("" → None).
_TEXT_FIELDS = (
    "alamat",
    "catatan",
    "kota",
    "npwp",
    "nib",
    "pic_sapaan",
    "pic_nama",
    "pic_jabatan",
    "pic_no_hp",
    "pic_email",
)


def _to_customer(row: dict[str, Any]) -> Customer:
    return Customer(
        id=row["id"],
        nama_perusahaan=row["nama_perusahaan"],
        alamat=row.get("alamat"),
        catatan=row.get("catatan"),
        is_active=bool(row.get("is_active", True)),
        created_at=row["created_at"],
        kota=row.get("kota"),
        npwp=row.get("npwp"),
        nib=row.get("nib"),
        status_pkp=bool(row.get("status_pkp", False)),
        termin_hari=row.get("termin_hari"),
        pic_sapaan=row.get("pic_sapaan"),
        pic_nama=row.get("pic_nama"),
        pic_jabatan=row.get("pic_jabatan"),
        pic_no_hp=row.get("pic_no_hp"),
        pic_email=row.get("pic_email"),
    )


def _build_payload(fields: dict[str, Any]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for key in _TEXT_FIELDS:
        if key in fields:
            data[key] = clean_text(fields[key])
    if "status_pkp" in fields and fields["status_pkp"] is not None:
        data["status_pkp"] = bool(fields["status_pkp"])
    if "termin_hari" in fields:
        data["termin_hari"] = fields["termin_hari"]
    return data


class CustomerService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    _SEARCH_COLUMNS = ["nama_perusahaan", "kota", "pic_nama", "pic_no_hp"]

    def _list_query(self, *, include_inactive: bool, q: str | None, select: str, count=None, head: bool = False):
        query = (
            self._db.table("customers").select(select, count=count, head=head)
            if count is not None
            else self._db.table("customers").select(select)
        )
        if not include_inactive:
            query = query.eq("is_active", True)
        if q and q.strip():
            query = query.or_(ilike_any(self._SEARCH_COLUMNS, q))
        return query

    async def list_page(
        self, *, params: PageParams, include_inactive: bool = False, q: str | None = None
    ) -> Page[Customer]:
        query = self._list_query(include_inactive=include_inactive, q=q, select="*", count=CountMethod.exact)
        res = await apply_window(query.order("nama_perusahaan"), params).execute()
        return build_page([_to_customer(r) for r in rows(res)], res.count, params)

    async def list_all(self, *, include_inactive: bool = False) -> list[Customer]:
        """Seluruh baris — dipakai dropdown customer di form job & penawaran."""
        q = self._db.table("customers").select("*").order("nama_perusahaan")
        if not include_inactive:
            q = q.eq("is_active", True)
        return [_to_customer(r) for r in rows(await q.execute())]

    async def get(self, customer_id: str) -> Customer:
        row = single(await self._db.table("customers").select("*").eq("id", customer_id).maybe_single().execute())
        if row is None:
            raise NotFoundError("Customer tidak ditemukan")
        return _to_customer(row)

    async def job_counts(self) -> dict[str, int]:
        res = await self._db.table("jobs").select("customer_id").execute()
        return dict(Counter(r["customer_id"] for r in rows(res)))

    async def create(self, payload: CustomerCreate) -> Customer:
        nama = payload.nama_perusahaan.strip()
        if not nama:
            raise ValidationError("Nama perusahaan wajib diisi")
        data = {"nama_perusahaan": nama, **_build_payload(payload.model_dump())}
        res = await self._db.table("customers").insert(data).execute()
        return _to_customer(rows(res)[0])

    async def update(self, customer_id: str, payload: CustomerUpdate) -> None:
        fields = payload.model_dump(exclude_unset=True)
        data = _build_payload(fields)
        if fields.get("nama_perusahaan") is not None:
            data["nama_perusahaan"] = fields["nama_perusahaan"].strip()
        if data:
            await self._db.table("customers").update(data).eq("id", customer_id).execute()

    async def deactivate(self, customer_id: str) -> None:
        await self._db.table("customers").update({"is_active": False}).eq("id", customer_id).execute()
