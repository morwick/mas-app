import { render, screen } from "@testing-library/react";
import { PeringatanBatal, WatermarkBatal } from "./watermark-batal";

describe("watermark CANCELED di surat", () => {
  it("muncul hanya bila pengajuan dibatalkan", () => {
    const { rerender } = render(<WatermarkBatal aktif={false} />);
    expect(screen.queryByText("CANCELED")).toBeNull();
    rerender(
      <>
        <WatermarkBatal aktif />
        <PeringatanBatal aktif teks="Tagihan ini dibatalkan" />
      </>
    );
    expect(screen.getByText("CANCELED")).toBeTruthy();
    expect(screen.getByText(/Tagihan ini dibatalkan/)).toBeTruthy();
  });

  it("penawaran kedaluwarsa bertanda EXPIRED", () => {
    render(
      <>
        <WatermarkBatal aktif teks="EXPIRED" />
        <PeringatanBatal aktif teks="Penawaran ini sudah kedaluwarsa" tanda="EXPIRED" />
      </>
    );
    expect(screen.getByText("EXPIRED")).toBeTruthy();
    expect(screen.getByText(/tanda EXPIRED/)).toBeTruthy();
  });
});
