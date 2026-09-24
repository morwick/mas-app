"""Konfigurasi aplikasi — semua dibaca dari environment variable / file .env."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase — Project Settings → API
    supabase_url: str
    supabase_anon_key: str
    # Menembus semua RLS. Hanya dipakai untuk cron dan operasi sistem internal.
    supabase_service_role_key: str = ""
    # Schema Postgres tempat seluruh tabel & fungsi aplikasi (lihat migration
    # 20260924000002). Harus terdaftar di Data API → Exposed schemas.
    supabase_db_schema: str = "transport"

    # Integrasi eksternal
    tracksolid_account: str = ""
    tracksolid_password: str = ""
    openrouteservice_api_key: str = ""

    # Rahasia untuk endpoint cron (Authorization: Bearer <CRON_SECRET>)
    cron_secret: str = ""

    # Firebase Cloud Messaging — path berkas service account JSON. Kosong = push nonaktif.
    firebase_credentials_file: str = ""

    # URL frontend — dipakai redirect tautan reset password
    app_url: str = "http://localhost:5173"

    # Origin yang boleh memanggil API (dipisah koma)
    cors_origins: str = "http://localhost:5173"

    # Bucket storage
    job_photos_bucket: str = "job-photos"
    incident_photos_bucket: str = "incident-photos"
    bukti_transfer_bucket: str = "bukti-transfer"

    environment: str = Field(default="development")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
