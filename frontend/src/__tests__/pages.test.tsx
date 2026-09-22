/**
 * Smoke test render: memastikan pohon provider, guard, dan halaman-halaman
 * utama bisa dirender tanpa error runtime. Panggilan API di-mock lewat
 * `fetch` global supaya tidak menyentuh backend.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, type RouteObject } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import { adminSession } from "@/lib/auth/session";
import { queryClient } from "@/lib/api/query";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { DriverLoginPage } from "@/features/driver-portal/pages/DriverPages";
import { TrackingExpiredPage } from "@/features/public-tracking/pages/TrackPages";
import { AdminLayout } from "@/app/layouts/AdminLayout";
import { RequireAuth } from "@/app/guards";
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { NotFoundPage } from "@/app/NotFoundPage";

function toElements(routes: RouteObject[]) {
  return routes.map((r, i) =>
    r.index ? (
      <Route key={i} index element={r.element} />
    ) : (
      <Route key={r.path ?? i} path={r.path} element={r.element}>
        {r.children ? toElements(r.children) : null}
      </Route>
    )
  );
}

// MemoryRouter (bukan data router) dipakai karena jsdom di Node 24 belum
// kompatibel dengan AbortSignal yang dibuat data router saat navigasi.
function renderAt(routes: RouteObject[], initialPath: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>{toElements(routes)}</Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

/** fetch palsu: memetakan path API → respons JSON. */
function mockApi(handlers: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
    const hit = Object.entries(handlers).find(([path]) => url.pathname === `/api${path}`);
    if (!hit) {
      return new Response(JSON.stringify({ detail: `tidak ada mock untuk ${url.pathname}` }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify(hit[1]), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const owner = {
  id: "u1",
  email: "owner@mas.id",
  nama: "Rika Sari",
  initials: "RS",
  role: "owner" as const,
  allowed_jenis_unit_ids: null
};

beforeEach(() => {
  localStorage.clear();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("halaman publik", () => {
  it("login admin", () => {
    renderAt([{ path: "/login", element: <LoginPage /> }], "/login");
    expect(screen.getByPlaceholderText("admin@mas.id")).toBeTruthy();
    expect(screen.getByText("Masuk")).toBeTruthy();
  });

  it("login driver", () => {
    renderAt([{ path: "/driver/login", element: <DriverLoginPage /> }], "/driver/login");
    expect(screen.getByPlaceholderText("08xxxxxxxxxx")).toBeTruthy();
  });

  it("link pelacakan berakhir", () => {
    renderAt([{ path: "/track/:token/expired", element: <TrackingExpiredPage /> }], "/track/x/expired");
    expect(screen.getByText("Link tracking sudah berakhir")).toBeTruthy();
  });

  it("404", () => {
    renderAt([{ path: "*", element: <NotFoundPage /> }], "/apa-saja");
    expect(screen.getByText("Halaman tidak ditemukan")).toBeTruthy();
  });
});

describe("guard", () => {
  it("mengarahkan ke login bila belum masuk", async () => {
    const routes = [
      { path: "/login", element: <LoginPage /> },
      {
        path: "/dashboard",
        element: <RequireAuth />,
        children: [{ index: true, element: <div>dashboard</div> }]
      }
    ];
    renderAt(routes, "/dashboard");
    await waitFor(() => expect(screen.getByPlaceholderText("admin@mas.id")).toBeTruthy());
  });
});

describe("area admin", () => {
  function loginAsOwner() {
    adminSession.set({
      access_token: "jwt",
      refresh_token: "r",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: owner
    });
  }

  it("dashboard dengan sidebar & lonceng", async () => {
    loginAsOwner();
    const fetchMock = mockApi({
      "/layout/counts": { units: 3, jobs_active: 1, drivers_available: 2 },
      "/notifications": [],
      "/dashboard": {
        units: [],
        counts: { standby: 2, bertugas: 1, perbaikan: 0 },
        active_jobs: []
      }
    });
    const routes = [
      {
        path: "/",
        element: <RequireAuth />,
        children: [
          {
            element: <AdminLayout />,
            children: [{ path: "dashboard", element: <DashboardPage /> }]
          }
        ]
      }
    ];
    renderAt(routes, "/dashboard");

    await waitFor(() => expect(screen.getAllByText("Rika Sari").length).toBeGreaterThan(0));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/dashboard"))).toBe(true)
    );
    // Token admin ikut terkirim sebagai Bearer.
    const init = fetchMock.mock.calls[0][1];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer jwt");
  });

  it("daftar customer", async () => {
    loginAsOwner();
    mockApi({
      "/customers": [
        {
          id: "c1",
          nama_perusahaan: "PT Contoh Sukses",
          alamat: "Pekanbaru",
          is_active: true,
          created_at: "2026-01-01T00:00:00Z",
          status_pkp: false
        }
      ],
      "/customers/job-counts": { c1: 4 }
    });
    renderAt([{ path: "/customers", element: <CustomersPage /> }], "/customers");
    await waitFor(() => expect(screen.getAllByText("PT Contoh Sukses").length).toBeGreaterThan(0));
  });
});
