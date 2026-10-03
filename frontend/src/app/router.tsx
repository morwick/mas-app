/**
 * Peta rute aplikasi. Path dipertahankan sama dengan versi sebelumnya supaya
 * tautan yang sudah dibagikan (pelacakan pelanggan, portal driver) tetap hidup.
 */

import { createBrowserRouter, Navigate, useParams } from "react-router-dom";
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
import {
  ApproverPage,
  PengajuanApprovalDetailPage,
  PengajuanApprovalPage
} from "@/features/approval/pages/ApprovalPages";

import { LoginPage } from "@/features/auth/pages/LoginPage";
import { ResetPasswordPage } from "@/features/auth/pages/ResetPasswordPage";
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { UnitsPage } from "@/features/units/pages/UnitsPage";
import { UnitDetailPage } from "@/features/units/pages/UnitDetailPage";
import { EditUnitPage, NewUnitPage } from "@/features/units/pages/UnitFormPage";
import { DriversPage } from "@/features/drivers/pages/DriversPage";
import { EditDriverPage, NewDriverPage } from "@/features/drivers/pages/DriverFormPage";
import { DriverDetailPage } from "@/features/drivers/pages/DriverDetailPage";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { EditCustomerPage, NewCustomerPage } from "@/features/customers/pages/CustomerFormPage";
import { VendorsPage } from "@/features/vendors/pages/VendorsPage";
import { EditVendorPage, NewVendorPage } from "@/features/vendors/pages/VendorFormPage";
import { JobsPage } from "@/features/jobs/pages/JobsPage";
import { JobDetailPage } from "@/features/jobs/pages/JobDetailPage";
import { EditJobPage } from "@/features/jobs/pages/JobFormPages";
import { JobConfirmationPage } from "@/features/jobs/pages/JobConfirmationPage";
import { JadwalPage } from "@/features/jobs/pages/JadwalPage";
import { SuratJalanPage } from "@/features/jobs/pages/SuratJalanPage";
import { ProyekDetailPage, ProyekPage, ProyekPerUnitPage } from "@/features/proyek/pages/ProyekPages";
import { TAMPILKAN_PROYEK_PER_UNIT } from "@/features/proyek/components/proyek-menu-header";
import { JenisBiayaPage } from "@/features/biaya-lain/pages/JenisBiayaPage";
import { EditProyekPage, NewProyekPage, TambahJobProyekPage } from "@/features/proyek/pages/ProyekFormPages";
import {
  FleetMapPage,
  TrackingDetailPage,
  TrackingListPage
} from "@/features/tracking/pages/TrackingPages";
import { ServicesPage } from "@/features/services/pages/ServicesPage";
import { LaporanPerawatan } from "@/features/perintah-kerja/components/laporan-perawatan";
import {
  AsuransiDetailPage,
  AsuransiPage,
  BengkelPage,
  EditAsuransiPage,
  MekanikPage,
  NewAsuransiPage
} from "@/features/asuransi/pages/AsuransiPages";
import {
  EditPerintahKerjaPage,
  NewPerintahKerjaPage,
  PerintahKerjaDetailPage
} from "@/features/perintah-kerja/pages/PerintahKerjaPages";
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
import { BastPenjualanPage, SuratPenjualanPage } from "@/features/penjualan-unit/pages/DokumenPenjualanPages";
import { BeritaAcaraPenghapusanPage } from "@/features/penghapusan-aset/pages/BeritaAcaraPenghapusanPage";
import { PenghapusanAsetPage } from "@/features/penghapusan-aset/pages/PenghapusanAsetPage";
import { UnitTrailerPage } from "@/features/unit-trailer/pages/UnitTrailerPage";
import { UnitTrailerDetailPage } from "@/features/unit-trailer/pages/UnitTrailerDetailPage";
import {
  CustomersReportPage,
  LabaReportPage,
  LabaTahunanReportPage,
  ReportsIndexPage,
  TAMPILKAN_LAPORAN_LABA,
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

/** `/jobs/:id/<apa pun>` lama → detail job. */
export function KeDetailJob() {
  const { id } = useParams();
  return <Navigate to={`/jobs/${id}`} replace />;
}

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
          // Approval: semua role — hak lihat & putus dijaga backend/database.
          { path: "/approval/:fitur", element: <PengajuanApprovalPage /> },
          { path: "/approval/:fitur/:id", element: <PengajuanApprovalDetailPage /> },
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
              { path: "/customers/:id/edit", element: <EditCustomerPage /> },
              // Vendor: hak akses sama dengan Customer.
              { path: "/vendors", element: <VendorsPage /> },
              { path: "/vendors/new", element: <NewVendorPage /> },
              { path: "/vendors/:id/edit", element: <EditVendorPage /> }
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
              { path: "/unit-trailer/:id", element: <UnitTrailerDetailPage /> },

              { path: "/drivers", element: <DriversPage /> },
              { path: "/drivers/new", element: <NewDriverPage /> },
              { path: "/drivers/:id", element: <DriverDetailPage /> },
              { path: "/drivers/:id/edit", element: <EditDriverPage /> },

              { path: "/tracking", element: <TrackingListPage /> },
              { path: "/tracking/peta", element: <FleetMapPage /> },
              { path: "/tracking/:id", element: <TrackingDetailPage /> },

              { path: "/uang-jalan", element: <UangJalanPage /> },
              { path: "/services", element: <ServicesPage /> },

              // Asuransi, bengkel, mekanik, perintah kerja: operator hanya
              // melihat (tombol aksi disembunyikan, backend menolak).
              { path: "/asuransi", element: <AsuransiPage /> },
              { path: "/asuransi/:id", element: <AsuransiDetailPage /> },
              { path: "/bengkel", element: <BengkelPage /> },
              { path: "/mekanik", element: <MekanikPage /> },
              { path: "/perintah-kerja/:id", element: <PerintahKerjaDetailPage /> }
            ]
          },

          {
            // Form asuransi & perintah kerja: superadmin & admin saja.
            element: <RequireRole roles={["superadmin", "admin"]} />,
            children: [
              { path: "/asuransi/new", element: <NewAsuransiPage /> },
              { path: "/asuransi/:id/edit", element: <EditAsuransiPage /> },
              { path: "/perintah-kerja/new", element: <NewPerintahKerjaPage /> },
              { path: "/perintah-kerja/:id/edit", element: <EditPerintahKerjaPage /> }
            ]
          },

          {
            // Detail job: finance ikut melihat (dibuka dari tagihan) — tanpa
            // tombol aksi; backend juga menolak perubahan job dari finance.
            element: <RequireRole roles={["superadmin", "admin", "finance"]} />,
            children: [
              // Penawaran: finance hanya melihat (tombol aksi disembunyikan,
              // backend menolak perubahan dari finance).
              { path: "/quotations", element: <QuotationsPage /> },
              { path: "/quotations/:id", element: <QuotationDetailPage /> }
            ]
          },

          {
            // Detail job: finance (dari tagihan) & operator (dari Pantau) hanya
            // melihat — semua tombol aksi disembunyikan.
            element: <RequireRole roles={["superadmin", "admin", "finance", "operator"]} />,
            children: [
              { path: "/jobs/:id", element: <JobDetailPage /> },
              // Detail proyek: ikut aturan lihat detail job.
              { path: "/proyek/:id", element: <ProyekDetailPage /> },
              // Tautan notifikasi lama "Job menunggu validasi" — panel validasi
              // ada di detail job, jadi diarahkan ke sana (bukan 404).
              { path: "/jobs/:id/validasi", element: <KeDetailJob /> }
            ]
          },

          {
            // Job & Penawaran penuh (buat/ubah/hapus): superadmin & admin saja.
            element: <RequireRole roles={["superadmin", "admin"]} />,
            children: [
              // Menu Proyek: Tab Proyek (/proyek) & Tab Proyek Detail (Job) (/jobs).
              { path: "/proyek", element: <ProyekPage /> },
              // Tab Proyek per unit (rute statis — didahulukan dari /proyek/:id).
              {
                path: "/proyek/per-unit",
                element: TAMPILKAN_PROYEK_PER_UNIT ? <ProyekPerUnitPage /> : <Navigate to="/proyek" replace />
              },
              { path: "/jobs", element: <JobsPage /> },
              // Proyek baru + job-jobnya. /jobs/new dipertahankan untuk tautan
              // lama (dashboard, penawaran "Buat job").
              { path: "/proyek/new", element: <NewProyekPage /> },
              { path: "/jobs/new", element: <NewProyekPage /> },
              // Edit proyek = PIC lapangan saja; tambah job di halaman terpisah.
              { path: "/proyek/:id/edit", element: <EditProyekPage /> },
              { path: "/proyek/:id/tambah-job", element: <TambahJobProyekPage /> },
              { path: "/jobs/jadwal", element: <JadwalPage /> },
              { path: "/jobs/:id/edit", element: <EditJobPage /> },
              { path: "/jobs/:id/confirmation", element: <JobConfirmationPage /> },

              { path: "/quotations/new", element: <NewQuotationPage /> },
              { path: "/quotations/:id/edit", element: <EditQuotationPage /> },

              { path: "/jenis-unit", element: <JenisUnitPage /> },
              { path: "/jenis-biaya", element: <JenisBiayaPage /> },
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
              {
                path: "/reports/laba",
                element: TAMPILKAN_LAPORAN_LABA ? <LabaReportPage /> : <Navigate to="/reports" replace />
              },
              { path: "/reports/laba-tahunan", element: <LabaTahunanReportPage /> },
              { path: "/reports/customers", element: <CustomersReportPage /> },
              { path: "/reports/perawatan", element: <LaporanPerawatan /> }
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
              { path: "/approver", element: <ApproverPage /> },
              { path: "/penjualan-unit", element: <PenjualanUnitPage /> },
              { path: "/penghapusan-aset", element: <PenghapusanAsetPage /> },
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
          { path: "/invoices/:id/cetak", element: <InvoicePrintPage /> },
          { path: "/penjualan-unit/:id/surat", element: <SuratPenjualanPage /> },
          { path: "/penjualan-unit/:id/bast", element: <BastPenjualanPage /> },
          { path: "/penghapusan-aset/:id/berita-acara", element: <BeritaAcaraPenghapusanPage /> }
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
