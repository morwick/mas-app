import { useState } from "react";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pagination, usePagination } from "@/components/ui/pagination";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("usePagination", () => {
  it("memotong baris sesuai ukuran halaman", () => {
    const { result } = renderHook(() => usePagination(rows(25), { pageSize: 10 }));
    expect(result.current.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.current.pageCount).toBe(3);
    expect(result.current.total).toBe(25);
    expect([result.current.from, result.current.to]).toEqual([1, 10]);
  });

  it("halaman terakhir hanya berisi sisanya", () => {
    const { result } = renderHook(() => usePagination(rows(25), { pageSize: 10 }));
    act(() => result.current.setPage(3));
    expect(result.current.items).toEqual([21, 22, 23, 24, 25]);
    expect([result.current.from, result.current.to]).toEqual([21, 25]);
  });

  it("daftar kosong tetap aman", () => {
    const { result } = renderHook(() => usePagination([], { pageSize: 10 }));
    expect(result.current.items).toEqual([]);
    expect(result.current.pageCount).toBe(1);
    expect(result.current.from).toBe(0);
  });

  it("kembali ke halaman 1 saat filter berubah", () => {
    // Tanpa ini, hasil filter yang cuma sedikit tampil kosong karena posisi
    // masih di halaman jauh.
    const { result, rerender } = renderHook(
      ({ data, key }: { data: number[]; key: string }) =>
        usePagination(data, { pageSize: 10, resetKey: key }),
      { initialProps: { data: rows(50), key: "" } }
    );
    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);

    rerender({ data: rows(12), key: "cari:abc" });
    expect(result.current.page).toBe(1);
    expect(result.current.items[0]).toBe(1);
  });

  it("menjepit halaman saat data menyusut tanpa ganti filter", () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: number[] }) => usePagination(data, { pageSize: 10 }),
      { initialProps: { data: rows(50) } }
    );
    act(() => result.current.setPage(5));
    rerender({ data: rows(12) });
    expect(result.current.page).toBe(2);
    expect(result.current.items).toEqual([11, 12]);
  });

  it("menolak nomor halaman di luar rentang", () => {
    const { result } = renderHook(() => usePagination(rows(25), { pageSize: 10 }));
    act(() => result.current.setPage(99));
    expect(result.current.page).toBe(3);
    act(() => result.current.setPage(-5));
    expect(result.current.page).toBe(1);
  });
});

function Harness({ count, pageSize }: { count: number; pageSize: number }) {
  const [data] = useState(() => rows(count));
  const pg = usePagination(data, { pageSize });
  return (
    <div>
      <ul>
        {pg.items.map((n) => (
          <li key={n}>baris-{n}</li>
        ))}
      </ul>
      <Pagination state={pg} label="unit" />
    </div>
  );
}

describe("Pagination", () => {
  it("menampilkan ringkasan jumlah", () => {
    render(<Harness count={25} pageSize={10} />);
    expect(screen.getByText("1–10 dari 25 unit")).toBeTruthy();
  });

  it("tidak menampilkan kontrol bila hanya satu halaman", () => {
    render(<Harness count={5} pageSize={10} />);
    expect(screen.getByText("1–5 dari 5 unit")).toBeTruthy();
    expect(screen.queryByLabelText("Halaman berikutnya")).toBeNull();
  });

  it("tidak menampilkan apa pun bila kosong", () => {
    const { container } = render(<Harness count={0} pageSize={10} />);
    expect(container.querySelector(".pagination")).toBeNull();
  });

  it("tombol berikutnya mengganti isi daftar", () => {
    render(<Harness count={25} pageSize={10} />);
    expect(screen.getByText("baris-1")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Halaman berikutnya"));
    expect(screen.queryByText("baris-1")).toBeNull();
    expect(screen.getByText("baris-11")).toBeTruthy();
    expect(screen.getByText("11–20 dari 25 unit")).toBeTruthy();
  });

  it("tombol ujung mati di batasnya", () => {
    render(<Harness count={25} pageSize={10} />);
    const prev = screen.getByLabelText("Halaman sebelumnya") as HTMLButtonElement;
    const next = screen.getByLabelText("Halaman berikutnya") as HTMLButtonElement;
    expect(prev.disabled).toBe(true);

    fireEvent.click(next);
    fireEvent.click(next);
    expect((screen.getByLabelText("Halaman berikutnya") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Halaman sebelumnya") as HTMLButtonElement).disabled).toBe(false);
  });

  it("nomor halaman bisa diklik langsung", () => {
    render(<Harness count={25} pageSize={10} />);
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByText("baris-21")).toBeTruthy();
    expect(screen.getByRole("button", { name: "3" }).getAttribute("aria-current")).toBe("page");
  });

  it("memakai elipsis saat halamannya banyak", () => {
    render(<Harness count={500} pageSize={10} />);
    expect(screen.getAllByText("…").length).toBeGreaterThan(0);
    // Halaman pertama & terakhir selalu terjangkau.
    expect(screen.getByRole("button", { name: "1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "50" })).toBeTruthy();
  });
});
