import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Debug endpoint: test login + getMonitorInfo untuk semua IMEI di DB
 * (atau IMEI custom lewat query ?imei=…).
 * Hapus setelah debugging selesai.
 */
const BASE_URL = "https://www.tracksolidpro.com";

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function callMonitorInfo(
  token: string,
  userId: string,
  imei: string
) {
  const res = await fetch(`${BASE_URL}/v3/new/newMonitor/getMonitorInfo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: token
    },
    body: JSON.stringify({ imei, userId, isAllFlag: 1 }),
    cache: "no-store"
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = process.env.TRACKSOLID_ACCOUNT;
  const password = process.env.TRACKSOLID_PASSWORD;
  if (!account || !password) {
    return NextResponse.json({ error: "Env vars belum ter-set" });
  }

  // STEP 1 — login
  const loginRes = await fetch(`${BASE_URL}/v3/new/homepage/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      account,
      password: md5(password),
      language: "id",
      nodeId: "",
      validCode: ""
    }),
    cache: "no-store"
  });
  const loginBody = await loginRes.json().catch(() => null);

  if (!loginBody?.ok || !loginBody?.data?.token) {
    return NextResponse.json({
      step: "login",
      status: loginRes.status,
      body: loginBody
    });
  }

  const token = loginBody.data.token as string;
  const claims = decodeJwtPayload(token);
  const userId = (claims?.accountId as string | undefined) ?? "";

  // STEP 2 — coba dapat list device yang account ini punya akses
  // (queryEquipmentList terlihat di Network tab user sebelumnya)
  const listRes = await fetch(
    `${BASE_URL}/v3/new/homepage/queryEquipmentList`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token
      },
      body: JSON.stringify({}),
      cache: "no-store"
    }
  );
  const listBody = await listRes.json().catch(() => null);

  // Extract IMEI list dari response (struktur bisa beda; kita coba flatten)
  const accessibleImeis: string[] = [];
  function walkForImei(obj: unknown) {
    if (!obj) return;
    if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (
          (k === "imei" || k === "deviceImei") &&
          typeof v === "string" &&
          /^\d{14,17}$/.test(v)
        ) {
          accessibleImeis.push(v);
        } else {
          walkForImei(v);
        }
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj) walkForImei(item);
    }
  }
  walkForImei(listBody);
  const uniqueImeis = Array.from(new Set(accessibleImeis));

  // STEP 3 — test semua IMEI dari DB (atau custom ?imei=…)
  const url = new URL(req.url);
  const customImei = url.searchParams.get("imei");

  let imeisToTest: Array<{ source: string; imei: string }> = [];
  if (customImei) {
    imeisToTest.push({ source: "query", imei: customImei });
  } else {
    const { data: units } = await supabase
      .from("units")
      .select("kode_unit, imei_gps")
      .eq("is_active", true)
      .not("imei_gps", "is", null);
    imeisToTest = ((units ?? []) as Array<{ kode_unit: string; imei_gps: string }>).map(
      (u) => ({ source: u.kode_unit, imei: u.imei_gps })
    );
  }

  const probes = [];
  for (const t of imeisToTest) {
    const r = await callMonitorInfo(token, userId, t.imei);
    probes.push({
      kode_unit: t.source,
      imei: t.imei,
      isAccessible: uniqueImeis.includes(t.imei),
      monitorStatus: r.status,
      monitorOk: r.body?.ok,
      monitorCode: r.body?.code,
      monitorMsg: r.body?.msg,
      dataLength: Array.isArray(r.body?.data) ? r.body.data.length : null
    });
  }

  return NextResponse.json({
    loginOk: true,
    accountIdFromToken: userId,
    accessibleImeis: uniqueImeis,
    accessibleImeiCount: uniqueImeis.length,
    equipmentListStatus: listRes.status,
    equipmentListPreviewKeys:
      listBody && typeof listBody === "object"
        ? Object.keys(listBody as Record<string, unknown>)
        : null,
    probes
  });
}
