/**
 * Opsi "Batalkan job" di modal ubah status: tidak ditawarkan untuk job
 * pengganti (ganti unit) maupun job yang uang jalannya sudah cair.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UpdateStatusModal } from "./update-status-modal";

function tampil(props: { jobPengganti?: boolean; uangJalanCair?: boolean }) {
  render(<UpdateStatusModal open onClose={() => {}} current="loading" onConfirm={() => {}} {...props} />);
}

describe("UpdateStatusModal — Batalkan job", () => {
  it("job biasa: opsi Batalkan job ada", () => {
    tampil({});
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("job pengganti: opsi Batalkan job tidak ada dan alasannya ditampilkan", () => {
    tampil({ jobPengganti: true });
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByText("Job pengganti (ganti unit) tidak bisa dibatalkan.")).toBeTruthy();
  });
});
