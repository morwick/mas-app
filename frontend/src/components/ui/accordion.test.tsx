/**
 * Warna header accordion: paling luar biru muda; accordion di dalam isi
 * accordion lain (anak) abu-abu muda. Judul lebih tegas saat terbuka.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccordionItem } from "./accordion";

/** Elemen header (pembungkus tombol judul). */
const header = (judul: string) => screen.getByRole("button", { name: new RegExp(judul) }).parentElement!;

describe("AccordionItem — warna header", () => {
  it("sukses: accordion paling luar memakai warna induk (biru muda)", () => {
    render(
      <AccordionItem title="Job 1" open onToggle={() => {}}>
        isi
      </AccordionItem>
    );
    expect(header("Job 1").style.background).toBe("var(--accordion-head-bg)");
  });

  it("sukses: accordion di dalam accordion memakai warna anak (abu-abu muda)", () => {
    render(
      <AccordionItem title="Job 1" open onToggle={() => {}}>
        <AccordionItem title="Detail Pengiriman" variant="flat" open onToggle={() => {}}>
          isi
        </AccordionItem>
      </AccordionItem>
    );
    expect(header("Job 1").style.background).toBe("var(--accordion-head-bg)");
    expect(header("Detail Pengiriman").style.background).toBe("var(--accordion-child-head-bg)");
  });

  it("edge: anak dari anak tetap abu-abu muda", () => {
    render(
      <AccordionItem title="A" open onToggle={() => {}}>
        <AccordionItem title="B" open onToggle={() => {}}>
          <AccordionItem title="C" open onToggle={() => {}}>
            isi
          </AccordionItem>
        </AccordionItem>
      </AccordionItem>
    );
    expect(header("C").style.background).toBe("var(--accordion-child-head-bg)");
  });

  it("edge: tertutup → tanpa garis pemisah; terbuka → ada garis pemisah", () => {
    const { rerender } = render(
      <AccordionItem title="Job 1" open={false} onToggle={() => {}}>
        isi
      </AccordionItem>
    );
    expect(header("Job 1").style.borderBottom).toContain("transparent");
    rerender(
      <AccordionItem title="Job 1" open onToggle={() => {}}>
        isi
      </AccordionItem>
    );
    expect(header("Job 1").style.borderBottom).toContain("var(--accordion-head-border)");
  });
});
