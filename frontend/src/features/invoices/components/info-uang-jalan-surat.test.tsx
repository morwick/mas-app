import { render, screen } from "@testing-library/react";
import { InfoUangJalanSurat } from "./info-uang-jalan-surat";

describe("info uang jalan & surat jalan di form tagihan", () => {
  it("foto surat jalan & bukti transfer tampil kecil, diklik → tab baru; penambahan uang jalan terlihat", () => {
    render(
      <InfoUangJalanSurat
        uangJalanPagu={2_500_000}
        uangJalanCair={1_500_000}
        uangJalanPaguAwal={2_000_000}
        uangJalanTransaksi={[
          {
            jenis: "pencairan",
            tanggal: "2026-09-10",
            jumlah: 1_500_000,
            keterangan: null,
            bukti_url: "https://x/tf.jpg"
          },
          {
            jenis: "penambahan_pagu",
            tanggal: "2026-09-12",
            jumlah: 500_000,
            keterangan: "Tol tambahan",
            bukti_url: null
          }
        ]}
        suratJalanLoadingUrls={["https://x/loading.jpg"]}
        suratJalanUnloadingUrls={[]}
      />
    );

    const fotoLoading = screen.getByAltText("Surat jalan loading");
    expect(fotoLoading.getAttribute("src")).toBe("https://x/loading.jpg");
    const tautan = fotoLoading.closest("a") as HTMLAnchorElement;
    expect(tautan.getAttribute("href")).toBe("https://x/loading.jpg");
    expect(tautan.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Belum ada")).toBeTruthy(); // unloading

    const bukti = screen.getByAltText(/Bukti transfer/);
    expect(bukti.closest("a")?.getAttribute("href")).toBe("https://x/tf.jpg");

    expect(screen.getByText(/Ada penambahan uang jalan/)).toBeTruthy();
    expect(screen.getByText(/Tol tambahan/)).toBeTruthy();
  });
});
