import os

import pytest
from fastapi.testclient import TestClient

# Nilai dummy supaya Settings bisa dibangun tanpa .env; tidak ada tes yang
# benar-benar menghubungi Supabase.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon-key")
os.environ.setdefault("CRON_SECRET", "rahasia-cron")


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    return TestClient(app)
