"""Titik masuk aplikasi FastAPI MAS-APP."""

from __future__ import annotations

import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import install_exception_handlers
from app.modules.auth.router import router as auth_router
from app.modules.cron.router import router as cron_router
from app.modules.customers.router import router as customers_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.driver_portal.router import router as driver_portal_router
from app.modules.drivers.router import router as drivers_router
from app.modules.incidents.router import router as incidents_router
from app.modules.invoices.router import router as invoices_router
from app.modules.jenis_unit.router import router as jenis_unit_router
from app.modules.jobs.router import router as jobs_router
from app.modules.maintenance.router import router as maintenance_router
from app.modules.notifications.router import router as notifications_router
from app.modules.quotations.router import router as quotations_router
from app.modules.reports.router import router as reports_router
from app.modules.search.router import router as search_router
from app.modules.tracking.router import router as tracking_router
from app.modules.uang_jalan.router import router as uang_jalan_router
from app.modules.units.router import router as units_router
from app.modules.users.router import router as users_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def build_api_router() -> APIRouter:
    api = APIRouter(prefix="/api")
    for router in (
        auth_router,
        users_router,
        jenis_unit_router,
        units_router,
        drivers_router,
        customers_router,
        jobs_router,
        incidents_router,
        maintenance_router,
        tracking_router,
        quotations_router,
        uang_jalan_router,
        invoices_router,
        reports_router,
        search_router,
        notifications_router,
        dashboard_router,
        driver_portal_router,
        cron_router,
    ):
        api.include_router(router)
    return api


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="MAS-APP API",
        version="0.1.0",
        description="API manajemen armada PT. Mitra Angkutan Sejati.",
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_exception_handlers(app)
    app.include_router(build_api_router())

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
