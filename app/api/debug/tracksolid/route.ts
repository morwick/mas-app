import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Debug endpoint: panggil TrackSolid langsung step-by-step + dump raw response.
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

export async function GET() {
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
  const userId = claims?.accountId as string | undefined;

  // STEP 2 — ambil unit pertama dengan IMEI
  const { data: units } = await supabase
    .from("units")
    .select("id, kode_unit, imei_gps")
    .eq("is_active", true)
    .not("imei_gps", "is", null)
    .limit(1);

  const probe = (units ?? [])[0] as
    | { id: string; kode_unit: string; imei_gps: string }
    | undefined;

  if (!probe) {
    return NextResponse.json({ step: "login_ok", error: "No unit dengan IMEI" });
  }

  // STEP 3 — call getMonitorInfo dengan dump raw response
  const monitorRes = await fetch(
    `${BASE_URL}/v3/new/newMonitor/getMonitorInfo`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token
      },
      body: JSON.stringify({
        imei: probe.imei_gps,
        userId: userId ?? "",
        isAllFlag: 1
      }),
      cache: "no-store"
    }
  );
  const monitorBody = await monitorRes.json().catch(() => null);

  return NextResponse.json({
    loginOk: true,
    accountIdFromToken: userId,
    probe: { kode_unit: probe.kode_unit, imei: probe.imei_gps },
    monitorStatus: monitorRes.status,
    monitorBody
  });
}
