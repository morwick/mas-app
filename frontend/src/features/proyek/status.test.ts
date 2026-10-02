import { proyekDibatalkan } from "./status";

describe("status proyek dibatalkan", () => {
  it("1 job dan job itu dibatalkan → proyek dibatalkan", () => {
    expect(proyekDibatalkan({ jumlah_job: 1, jumlah_job_batal: 1 })).toBe(true);
  });
  it("masih ada job yang tidak batal → proyek tidak dibatalkan", () => {
    expect(proyekDibatalkan({ jumlah_job: 2, jumlah_job_batal: 1 })).toBe(false);
  });
  it("proyek tanpa job tidak dianggap dibatalkan", () => {
    expect(proyekDibatalkan({ jumlah_job: 0, jumlah_job_batal: 0 })).toBe(false);
  });
});
