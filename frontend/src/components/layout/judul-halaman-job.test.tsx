/** Halaman job ada di bawah menu Job: "Job › Detail job", bukan "Detail proyek". */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TopBar } from "./top-bar";

vi.mock("./global-search", () => ({ GlobalSearch: () => null }));
vi.mock("./notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("./profile-menu", () => ({ ProfileMenu: () => null }));

const ID = "3f2a9c1e-1234-4abc-9def-001122334455";

function tampil(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <TopBar />
    </MemoryRouter>
  );
}

describe("judul halaman job", () => {
  it("detail job: Job › Detail job", () => {
    tampil(`/jobs/${ID}`);
    expect(screen.getByText("Job")).toBeTruthy();
    expect(screen.getByText("Detail job")).toBeTruthy();
    expect(screen.queryByText("Detail proyek")).toBeNull();
  });

  it("edit job: judulnya Edit job", () => {
    tampil(`/jobs/${ID}/edit`);
    expect(screen.getByText("Edit job")).toBeTruthy();
  });

  it("detail proyek tetap Detail proyek", () => {
    tampil(`/proyek/${ID}`);
    expect(screen.getByText("Detail proyek")).toBeTruthy();
  });
});
