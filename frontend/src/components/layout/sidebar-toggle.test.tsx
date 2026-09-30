/**
 * Menu kiri bisa dilipat jadi deretan ikon (tidak hilang penuh) dari tombol
 * di top bar; ikon tetap bisa diklik & bernama (tooltip); pilihan diingat
 * setelah halaman dimuat ulang.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { useSidebarMini } from "./use-sidebar-mini";

vi.mock("./global-search", () => ({ GlobalSearch: () => null }));
vi.mock("./notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("./profile-menu", () => ({ ProfileMenu: () => null }));

function Layout() {
  const [mini, toggle] = useSidebarMini();
  return (
    <MemoryRouter initialEntries={["/units"]}>
      <Sidebar
        user={{ nama: "Mega", email: "m@x.id", initials: "M", role: "superadmin" }}
        counts={{ jobsActive: 3 }}
        mini={mini}
      />
      <TopBar sidebarMini={mini} onToggleSidebar={toggle} />
    </MemoryRouter>
  );
}

const sidebar = () => document.querySelector("aside") as HTMLElement;

beforeEach(() => localStorage.clear());

describe("menu kiri bisa dilipat jadi ikon", () => {
  it("dilipat: label hilang, ikon tetap ada & bisa diklik, halaman aktif tetap disorot", () => {
    render(<Layout />);
    expect(within(sidebar()).getByText("Unit")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lipat menu" }));
    expect(sidebar().getAttribute("data-mini")).toBe("true");
    expect(sidebar().style.width).toBe("64px");
    // Label teks tidak tampil, tapi setiap menu tetap ada sebagai ikon bernama.
    expect(within(sidebar()).queryByText("Unit")).toBeNull();
    const unit = within(sidebar()).getByRole("link", { name: "Unit" });
    expect(unit.getAttribute("href")).toBe("/units");
    expect(unit.getAttribute("title")).toBe("Unit");
    expect(within(sidebar()).getByRole("link", { name: "Dashboard" })).toBeTruthy();
    expect(within(sidebar()).getByRole("link", { name: "Karyawan" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Buka menu" }));
    expect(sidebar().getAttribute("data-mini")).toBe("false");
    expect(within(sidebar()).getByText("Unit")).toBeTruthy();
  });

  it("pilihan diingat setelah halaman dimuat ulang", () => {
    const { unmount } = render(<Layout />);
    fireEvent.click(screen.getByRole("button", { name: "Lipat menu" }));
    unmount();
    render(<Layout />);
    expect(sidebar().getAttribute("data-mini")).toBe("true");
    expect(screen.getByRole("button", { name: "Buka menu" })).toBeTruthy();
  });
});
