import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// router.tsx mengimpor semua halaman; cukup komponen pengalihnya yang diuji.
vi.mock("./layouts/AdminLayout", () => ({ AdminLayout: () => null }));

function Detail() {
  return <div>detail {useLocation().pathname}</div>;
}

describe("tautan notifikasi 'Job menunggu validasi'", () => {
  it("/jobs/:id/validasi dialihkan ke detail job, bukan 404", async () => {
    const { KeDetailJob } = await import("./router");
    render(
      <MemoryRouter initialEntries={["/jobs/abc-123/validasi"]}>
        <Routes>
          <Route path="/jobs/:id/validasi" element={<KeDetailJob />} />
          <Route path="/jobs/:id" element={<Detail />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("detail /jobs/abc-123")).toBeTruthy();
  });
});
