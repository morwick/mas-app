/**
 * Peta rute aplikasi. Path dipertahankan sama dengan versi sebelumnya supaya
 * tautan yang sudah dibagikan (pelacakan pelanggan, portal driver) tetap hidup.
 */

import { createBrowserRouter, Navigate } from "react-router-dom";
import { AdminLayout } from "./layouts/AdminLayout";
import { AuthLayout } from "./layouts/AuthLayout";
import { DriverLayout } from "./layouts/DriverLayout";
import { PrintLayout } from "./layouts/PrintLayout";
import {
  RedirectIfAuthed,
  RedirectIfDriverAuthed,
  RequireAuth,
  RequireDriver,
  RequireRole,
  RequireSuperadmin
} from "./guards";
import { NotFoundPage } from "./NotFoundPage";
import { NotificationsPage } from "@/features/notifications/pages/NotificationsPage";

import { LoginPage } from "@/features/auth/pages/LoginPage";
import { ResetPasswordPage } from "@/features/auth/pages/ResetPasswordPage";
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { UnitsPage } from "@/features/units/pages/UnitsPage";
import { UnitDetailPage } from "@/features/units/pages/UnitDetailPage";
import { EditUnitPage, NewUnitPage } from "@/features/units/pages/UnitFormPage";
import { DriversPage } from "@/features/drivers/pages/DriversPage";
import { EditDriverPage, NewDriverPage } from "@/features/drivers/pages/DriverFormPage";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { EditCustomerPage, NewCustomerPage } from "@/features/customers/pages/CustomerFormPage";
import { JobsPage } from "@/features/jobs/pages/JobsPage";
import { JobDetailPage } from "@/features/jobs/pages/JobDetailPage";
import { EditJobPage, NewJobPage } from "@/features/jobs/pages/JobFormPages";
import { JobConfirmationPage } from "@/features/jobs/pages/JobConfirmationPage";
import { JadwalPage } from "@/features/jobs/pages/JadwalPage";
import { SuratJalanPage } from "@/features/jobs/pages/SuratJalanPage";
import {
  FleetMapPage,
  TrackingDetailPage,
  TrackingListPage
} from "@/features/tracking/pages/TrackingPages";
import { ServicesPage } from "@/features/services/pages/ServicesPage";
import { QuotationsPage } from "@/features/quotations/pages/QuotationsPage";
import { QuotationDetailPage } from "@/features/quotations/pages/QuotationDetailPage";
import {
  EditQuotationPage,
  NewQuotationPage
} from "@/features/quotations/pages/QuotationFormPages";
import { QuotationPrintPage } from "@/features/quotations/pages/QuotationPrintPage";
import { UangJalanPage } from "@/features/uang-jalan/pages/UangJalanPage";
import { InvoicesPage } from "@/features/invoices/pages/InvoicesPage";
import { InvoiceDetailPage } from "@/features/invoices/pages/InvoiceDetailPage";
import { EditInvoicePage, NewInvoicePage } from "@/features/invoices/pages/InvoiceFormPages";
import { InvoicePrintPage } from "@/features/invoices/pages/InvoicePrintPage";
import { PiutangPage } from "@/features/invoices/pages/PiutangPage";
import { LogSistemPage } from "@/features/log-sistem/pages/LogSistemPage";
import { KaryawanPage } from "@/features/karyawan/pages/KaryawanPage";
import { PenjualanUnitPage } from "@/features/penjualan-unit/pages/PenjualanUnitPage";
import { UnitTrailerPage } from "@/features/unit-trailer/pages/UnitTrailerPage";
import {
  CustomersReportPage,
  LabaReportPage,
  ReportsIndexPage,
  UtilisasiReportPage
} from "@/features/reports/pages/ReportsPages";
import {
  JenisUnitPage,
  ProfilePage,
  UsersPage
} from "@/features/settings/pages/SettingsPages";
import {
  DriverDashboardPage,
  DriverHistoryPage,
  DriverJobDetailPage,
  DriverLoginPage
} from "@/features/driver-portal/pages/DriverPages";
import {
  CustomerTrackingPage,
  TrackingExpiredPage
} from "@/features/public-tracking/pages/TrackPages";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/dashboard" replace /> },

  // ── Auth admin ────────────────────────────────────────────────────────────
  {
    element: <RedirectIfAuthed />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/reset-password", element: <ResetPasswordPage /> }
        ]
      }
    ]
  },

  // ── Area admin ────────────────────────────────────────────────────────────
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: "/dashboard", element: <DashboardPage /> },

          // Laporan Utilisasi terbuka untuk semua role login (termasuk
          // operator); Laba & Customers dibatasi di grup superadmin/finance/
          // admin di bawah. ReportsIndexPage sendiri menyaring kartu yang
          // ditampilkan sesuai role.
          { path: "/reports", element: <ReportsIndexPage /> },
          { path: "/reports/utilisasi", element: <UtilisasiReportPage /> },

          { path: "/notifikasi", element: <NotificationsPage /> },
          { path: "/profil", element: <ProfilePage /> },
          // Menu "Pengaturan" sudah dihapus; alamat lamanya tetap hidup.
          { path: "/settings", element: <Navigate to="/profil" replace /> },
          { path: "/settings/profile", element: <Navigate to="/profil" replace /> },
          {
            path: "/settings/users",
            element: <Navigate to="/pengguna" replace />
          },

          {
            // Customer: superadmin, admin, finance — bukan operator.
            element: <RequireRole roles={["superadmin", "admin", "finance"]} />,
            children: [
              { path: "/customers", element: <CustomersPage /> },
              { path: "/customers/new", element: <NewCustomerPage /> },
              { path: "/customers/:id/edit", element: <EditCustomerPage /> }
            ]
          },

          {
            // Wilayah operasional armada — superadmin, admin, operator (bukan
            // finance). Operator hanya lihat; tombol aksi disembunyikan di
            // masing-masing komponen.
            element: <RequireRole roles={["superadmin", "admin", "operator"]} />,
            children: [
              { path: "/units", element: <UnitsPage /> },
              { path: "/units/new", element: <NewUnitPage /> },
              { path: "/units/:id", element: <UnitDetailPage /> },
              { path: "/units/:id/edit", element: <EditUnitPage /> },
              { path: "/unit-trailer", element: <UnitTrailerPage /> },

              { path: "/drivers", element: <DriversPage /> },
              { path: "/drivers/new", element: <NewDriverPage /> },
              { path: "/drivers/:id/edit", element: <EditDriverPage /> },

              { path: "/tracking", element: <TrackingListPage /> },
              { path: "/tracking/peta", element: <FleetMapPage /> },
              { path: "/tracking/:id", element: <TrackingDetailPage /> },

              { path: "/uang-jalan", element: <UangJalanPage /> },
              { path: "/services", element: <ServicesPage /> }
            ]
          },

          {
            // Job & Penawaran penuh (buat/ubah/hapus): superadmin & admin saja.
            element: <RequireRole roles={["superadmin", "admin"]} />,
            children: [
              { path: "/jobs", element: <JobsPage /> },
              { path: "/jobs/new", element: <NewJobPage /> },
              { path: "/jobs/jadwal", element: <JadwalPage /> },
              { path: "/jobs/:id", element: <JobDetailPage /> },
              { path: "/jobs/:id/edit", element: <EditJobPage /> },
              { path: "/jobs/:id/confirmation", element: <JobConfirmationPage /> },

              { path: "/quotations", element: <QuotationsPage /> },
              { path: "/quotations/new", element: <NewQuotationPage /> },
              { path: "/quotations/:id", element: <QuotationDetailPage /> },
              { path: "/quotations/:id/edit", element: <EditQuotationPage /> },

              { path: "/jenis-unit", element: <JenisUnitPage /> },
              // Alamat lama sebelum Jenis Unit pindah ke menu Master.
              {
                path: "/settings/jenis-unit",
                element: <Navigate to="/jenis-unit" replace />
              }
            ]
          },

          {
            // Sub-laporan Laba & Customers: bukan untuk operator.
            element: <RequireRole roles={["superadmin", "admin", "finance"]} />,
            children: [
              { path: "/reports/laba", element: <LabaReportPage /> },
              { path: "/reports/customers", element: <CustomersReportPage /> }
            ]
          },

          {
            // Tagihan & Piutang & Log Sistem: superadmin dan finance.
            element: <RequireRole roles={["superadmin", "finance"]} />,
            children: [
              { path: "/invoices", element: <InvoicesPage /> },
              { path: "/invoices/new", element: <NewInvoicePage /> },
              { path: "/invoices/:id", element: <InvoiceDetailPage /> },
              { path: "/invoices/:id/edit", element: <EditInvoicePage /> },
              { path: "/piutang", element: <PiutangPage /> },
              { path: "/log-sistem", element: <LogSistemPage /> }
            ]
          },
          {
            element: <RequireSuperadmin />,
            children: [
              { path: "/karyawan", element: <KaryawanPage /> },
              { path: "/penjualan-unit", element: <PenjualanUnitPage /> },
              { path: "/pengguna", element: <UsersPage /> }
            ]
          }
        ]
      },
      // Halaman cetak: tanpa sidebar/topbar.
      {
        element: <PrintLayout />,
        children: [
          { path: "/jobs/:id/surat-jalan", element: <SuratJalanPage /> },
          { path: "/quotations/:id/cetak", element: <QuotationPrintPage /> },
          { path: "/invoices/:id/cetak", element: <InvoicePrintPage /> }
        ]
      }
    ]
  },

  // ── Portal driver ─────────────────────────────────────────────────────────
  {
    element: <RedirectIfDriverAuthed />,
    children: [{ path: "/driver/login", element: <DriverLoginPage /> }]
  },
  {
    element: <RequireDriver />,
    children: [
      {
        element: <DriverLayout />,
        children: [
          { path: "/driver", element: <Navigate to="/driver/dashboard" replace /> },
          { path: "/driver/dashboard", element: <DriverDashboardPage /> },
          { path: "/driver/riwayat", element: <DriverHistoryPage /> },
          { path: "/driver/jobs/:id", element: <DriverJobDetailPage /> }
        ]
      }
    ]
  },

  // ── Pelacakan pelanggan (publik) ──────────────────────────────────────────
  { path: "/track/:token", element: <CustomerTrackingPage /> },
  { path: "/track/:token/expired", element: <TrackingExpiredPage /> },

  { path: "*", element: <NotFoundPage /> }
]);
