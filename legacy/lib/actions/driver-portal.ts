"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createDriverClient } from "@/lib/supabase/server";
import {
  clearDriverCookie,
  getDriverSession,
  getDriverToken,
  setDriverCookie
} from "@/lib/driver-session";
import type { ActionResult } from "./auth";
import type { JobStatus } from "@/lib/types";

/**
 * Login driver: nomor HP + PIN 6 angka yang di-set admin.
 *
 * Verifikasi PIN dan penerbitan token dikerjakan fungsi `driver_login` di
 * database supaya PIN mentah tidak pernah dibandingkan di sisi aplikasi dan
 * pesan gagalnya seragam — nomor tidak terdaftar dan PIN salah tidak boleh
 * bisa dibedakan dari halaman login.
 */
export async function driverLoginAction(
  _: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  const noHp = String(formData.get("no_hp") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();

  if (!noHp) return { ok: false, error: "Nomor HP wajib diisi" };
  if (!/^\d{6}$/.test(pin)) return { ok: false, error: "PIN harus 6 angka" };

  const ua = (await headers()).get("user-agent") ?? undefined;

  const supabase = createDriverClient();
  const { data, error } = await supabase.rpc("driver_login", {
    p_no_hp: noHp,
    p_pin: pin,
    p_user_agent: ua
  });

  if (error) {
    return { ok: false, error: "Nomor HP atau PIN salah" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token) {
    return { ok: false, error: "Nomor HP atau PIN salah" };
  }

  await setDriverCookie(row.token as string);
  revalidatePath("/driver/dashboard");
  redirect("/driver/dashboard");
}

export async function driverLogoutAction(): Promise<void> {
  const token = await getDriverToken();
  if (token) {
    await createDriverClient(token).rpc("driver_logout");
  }
  await clearDriverCookie();
  redirect("/driver/login");
}

/**
 * Driver menyatakan siap menjalankan job.
 *
 * Driver tidak bisa menolak — penugasan tetap keputusan admin. Yang dicatat
 * adalah kapan job benar-benar sampai ke orangnya, supaya job yang belum
 * dibaca menjelang ETD bisa ditelepon, bukan ketahuan saat truk tidak datang.
 */
export async function driverAcceptJobAction(
  jobId: string
): Promise<ActionResult<{ accepted_at: string }>> {
  const token = await getDriverToken();
  if (!token) return { ok: false, error: "Sesi habis. Silakan login lagi." };

  const supabase = createDriverClient(token);
  const { data, error } = await supabase.rpc("driver_accept_job", {
    p_job_id: jobId
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/driver/dashboard");
  revalidatePath(`/driver/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");

  return { ok: true, data: { accepted_at: data as string } };
}

/**
 * Update status job dari portal driver.
 *
 * Sebelumnya action ini mengirim UPDATE langsung ke tabel jobs sebagai anon —
 * tidak ada policy UPDATE yang cocok, jadi nol baris berubah dan Supabase
 * tetap membalas tanpa error. Portal melapor "berhasil" sementara status di
 * kantor tidak bergerak sama sekali. Sekarang lewat RPC yang mengunci urutan
 * status dan mengembalikan error kalau ditolak.
 */
export async function driverUpdateJobStatusAction(
  jobId: string,
  nextStatus: JobStatus,
  notes?: string
): Promise<ActionResult<{ status: JobStatus }>> {
  const token = await getDriverToken();
  if (!token) return { ok: false, error: "Sesi habis. Silakan login lagi." };

  const supabase = createDriverClient(token);
  const { data, error } = await supabase.rpc("driver_update_job_status", {
    p_job_id: jobId,
    p_status: nextStatus,
    p_notes: notes?.trim() || null
  });
  if (error) return { ok: false, error: error.message };

  // Halaman customer ikut di-refresh — status yang dia lihat berasal dari job
  // yang sama.
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("share_token")
    .eq("id", jobId)
    .maybeSingle();

  revalidatePath("/driver/dashboard");
  revalidatePath(`/driver/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");
  const shareToken = (jobRow as { share_token: string } | null)?.share_token;
  if (shareToken) revalidatePath(`/track/${shareToken}`);

  return { ok: true, data: { status: data as JobStatus } };
}

/** Batas ukuran & tipe disamakan dengan bucket job-photos. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/**
 * Serah terima barang di lokasi bongkar, sekaligus menutup job.
 *
 * Tanda tangan datang sebagai data URL dari kanvas di HP driver, lalu diunggah
 * ke bucket yang sama dengan foto job. Yang menutup job adalah RPC di database
 * dalam satu transaksi — jadi tidak mungkin ada job berstatus selesai yang
 * bukti terimanya gagal tersimpan.
 */
export async function driverSubmitPodAction(input: {
  jobId: string;
  penerima_nama: string;
  penerima_jabatan?: string | null;
  catatan?: string | null;
  /** PNG data URL dari kanvas tanda tangan. */
  signature_data_url?: string | null;
}): Promise<ActionResult> {
  const token = await getDriverToken();
  if (!token) return { ok: false, error: "Sesi habis. Silakan login lagi." };

  if (!input.penerima_nama?.trim())
    return { ok: false, error: "Nama penerima wajib diisi" };

  const supabase = createDriverClient(token);

  let signaturePath: string | null = null;
  if (input.signature_data_url) {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(
      input.signature_data_url
    );
    if (!match) return { ok: false, error: "Format tanda tangan tidak dikenal" };

    const bytes = Buffer.from(match[1], "base64");
    if (bytes.byteLength > MAX_PHOTO_BYTES)
      return { ok: false, error: "Tanda tangan terlalu besar" };

    signaturePath = `${input.jobId}/pod/${Date.now()}.png`;
    const { error: upErr } = await supabase.storage
      .from("job-photos")
      .upload(signaturePath, bytes, { contentType: "image/png" });
    if (upErr) return { ok: false, error: upErr.message };
  }

  const { error } = await supabase.rpc("driver_submit_pod", {
    p_job_id: input.jobId,
    p_nama: input.penerima_nama.trim(),
    p_jabatan: input.penerima_jabatan?.trim() || null,
    p_signature_path: signaturePath,
    p_catatan: input.catatan?.trim() || null
  });
  if (error) {
    // Job tidak jadi ditutup — tanda tangannya jangan ditinggal menggantung
    // di bucket tanpa ada baris yang menunjuknya.
    if (signaturePath) {
      await supabase.storage.from("job-photos").remove([signaturePath]);
    }
    return { ok: false, error: error.message };
  }

  const { data: jobRow } = await supabase
    .from("jobs")
    .select("share_token")
    .eq("id", input.jobId)
    .maybeSingle();

  revalidatePath("/driver/dashboard");
  revalidatePath(`/driver/jobs/${input.jobId}`);
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath("/dashboard");
  const shareToken = (jobRow as { share_token: string } | null)?.share_token;
  if (shareToken) revalidatePath(`/track/${shareToken}`);

  return { ok: true, data: undefined };
}

export async function driverUploadPhotoAction(
  formData: FormData
): Promise<ActionResult<{ file_path: string }>> {
  const session = await getDriverSession();
  if (!session) return { ok: false, error: "Sesi habis. Silakan login lagi." };

  const jobId = String(formData.get("job_id") ?? "");
  const photoType = String(formData.get("type") ?? "") as "loading" | "unloading";
  const file = formData.get("photo");

  if (!jobId || !photoType || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Data tidak lengkap" };
  }
  if (photoType !== "loading" && photoType !== "unloading") {
    return { ok: false, error: "Jenis foto tidak dikenal" };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "Ukuran foto melebihi 5 MB" };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false, error: "Format foto harus JPG, PNG, atau WEBP" };
  }

  const supabase = createDriverClient(session.token);

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `${jobId}/${photoType}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("job-photos")
    .upload(fileName, file, { contentType: file.type });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { error: insertError } = await supabase
    .from("job_photos")
    .insert({ job_id: jobId, type: photoType, file_path: fileName });
  if (insertError) {
    // File sudah terlanjur naik tapi barisnya gagal — hapus lagi supaya bucket
    // tidak menyimpan foto yang tidak pernah muncul di mana pun.
    await supabase.storage.from("job-photos").remove([fileName]);
    return { ok: false, error: insertError.message };
  }

  revalidatePath("/driver/dashboard");
  revalidatePath(`/driver/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}`);

  return { ok: true, data: { file_path: fileName } };
}
