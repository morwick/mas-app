import "server-only";
import { createHash } from "crypto";

/**
 * TrackSolid client — login + getMonitorInfo.
 *
 * Auth flow (per investigasi DevTools tracksolidpro.com):
 *   1. POST /v3/new/homepage/login  body { account, password: MD5(plain), language, nodeId, validCode }
 *      → response.data.token = JWT. accountId di-embed sebagai claim JWT
 *   2. POST /v3/new/newMonitor/getMonitorInfo  header Authorization: <raw_token>  body { imei, userId, isAllFlag: 1 }
 *      → response.data.monitorBaseVOS[] dengan key "address" & "latlng".source_latlng
 *
 * Session dicache in-memory: 1 instance worker = 1 token. Re-login otomatis
 * kalau call mengembalikan status auth-error (code 100/401).
 *
 * Note: ini scraping endpoint internal TrackSolid (bukan Open API resmi).
 * Endpoint bisa berubah sewaktu-waktu → siapkan logging + fallback.
 */

const BASE_URL = "https://www.tracksolidpro.com";

interface LoginResponse {
  ok: boolean;
  code: number;
  msg: string;
  data?: { token: string; upgradeTips?: boolean };
}

interface MonitorInfoResponse {
  ok: boolean;
  code: number;
  msg: string;
  data?: Array<{
    modeleName: string;
    monitorBaseVOS?: Array<{
      key: string;
      value: unknown;
      enableFlag?: boolean;
      order?: number;
    }>;
  }>;
}

interface SessionState {
  token: string;
  userId: string;
  cookies: string;
}

let cached: SessionState | null = null;
let inflightLogin: Promise<SessionState> | null = null;

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

/**
 * Header browser-like supaya TrackSolid tidak treat request kita sebagai bot.
 * Penting untuk environment serverless (Vercel/Cloudflare) — server origin
 * mungkin di-filter, sedangkan request dari browser native lolos.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  "Accept-Language": "id,en-US;q=0.9,en;q=0.8",
  Origin: BASE_URL,
  Referer: `${BASE_URL}/resource/dev/index.html`,
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin"
};

/**
 * Parse Set-Cookie headers dari response. Node 20+ punya getSetCookie(),
 * fallback ke single header untuk runtime lain.
 */
function extractCookies(res: Response): string {
  const setCookieHeaders: string[] = [];
  const headers = res.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === "function") {
    setCookieHeaders.push(...headers.getSetCookie());
  } else {
    const single = res.headers.get("set-cookie");
    if (single) setCookieHeaders.push(single);
  }
  // Ambil bagian name=value (sebelum ;), gabungkan
  return setCookieHeaders
    .map((c) => c.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

/**
 * JWT decode tanpa verifikasi signature (kita cuma butuh claim accountId).
 * Token sudah authoritative dari TrackSolid, tidak perlu kita validasi sekali lagi.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    // JWT pakai base64url; Node Buffer mendukungnya langsung.
    const json = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function loginToTrackSolid(): Promise<SessionState> {
  const account = process.env.TRACKSOLID_ACCOUNT;
  const password = process.env.TRACKSOLID_PASSWORD;
  if (!account || !password) {
    throw new Error(
      "TRACKSOLID_ACCOUNT dan TRACKSOLID_PASSWORD harus diisi di env"
    );
  }

  const res = await fetch(`${BASE_URL}/v3/new/homepage/login`, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*"
    },
    body: JSON.stringify({
      account,
      password: md5(password),
      language: "id",
      nodeId: "",
      validCode: ""
    }),
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`TrackSolid login HTTP ${res.status}`);
  }

  const cookies = extractCookies(res);
  const body = (await res.json()) as LoginResponse;
  if (!body.ok || !body.data?.token) {
    throw new Error(
      `TrackSolid login gagal: ${body.msg ?? "unknown"} (code ${body.code})`
    );
  }

  const claims = decodeJwtPayload(body.data.token);
  const userId = claims?.["accountId"];
  if (typeof userId !== "string") {
    throw new Error("Token TrackSolid tidak mengandung accountId");
  }

  return { token: body.data.token, userId, cookies };
}

async function getSession(forceRefresh = false): Promise<SessionState> {
  if (!forceRefresh && cached) return cached;
  if (inflightLogin) return inflightLogin;
  inflightLogin = loginToTrackSolid()
    .then((s) => {
      cached = s;
      return s;
    })
    .finally(() => {
      inflightLogin = null;
    });
  return inflightLogin;
}

export interface VehicleLocation {
  /** Latitude WGS84 — null kalau device offline / belum pernah fix */
  lat: number | null;
  /** Longitude WGS84 */
  lng: number | null;
  /** Alamat hasil reverse geocode dari TrackSolid (kalau ada) */
  address: string | null;
}

function extractFromMonitorInfo(body: MonitorInfoResponse): VehicleLocation {
  const positionBlock = body.data?.find((b) => b.modeleName === "latestPosition");
  const fields = positionBlock?.monitorBaseVOS ?? [];

  const addressField = fields.find((f) => f.key === "address");
  const latlngField = fields.find((f) => f.key === "latlng");

  let lat: number | null = null;
  let lng: number | null = null;

  // latlng value sendiri adalah array of sub-fields. Yang kita pakai: source_latlng = "lat,lng" desimal.
  if (Array.isArray(latlngField?.value)) {
    const source = (latlngField.value as Array<{ key: string; value: string }>).find(
      (v) => v.key === "source_latlng"
    );
    if (source?.value && typeof source.value === "string") {
      const [latStr, lngStr] = source.value.split(",");
      const latNum = Number(latStr);
      const lngNum = Number(lngStr);
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        lat = latNum;
        lng = lngNum;
      }
    }
  }

  const address =
    typeof addressField?.value === "string" && addressField.value.trim()
      ? (addressField.value as string)
      : null;

  return { lat, lng, address };
}

async function callMonitorInfo(
  imei: string,
  session: SessionState
): Promise<{ status: number; body: MonitorInfoResponse }> {
  const headers: Record<string, string> = {
    ...BROWSER_HEADERS,
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    Authorization: session.token
  };
  if (session.cookies) headers["Cookie"] = session.cookies;

  const res = await fetch(`${BASE_URL}/v3/new/newMonitor/getMonitorInfo`, {
    method: "POST",
    headers,
    body: JSON.stringify({ imei, userId: session.userId, isAllFlag: 1 }),
    cache: "no-store"
  });

  const body = (await res.json().catch(() => ({}))) as MonitorInfoResponse;
  return { status: res.status, body };
}

/**
 * True kalau response menunjukkan token expired/invalid → perlu re-login.
 * TrackSolid pakai response.code untuk semantic error, bukan HTTP status (selalu 200).
 */
function isAuthError(status: number, body: MonitorInfoResponse): boolean {
  if (status === 401 || status === 403) return true;
  // Code 100 = "token invalid" di banyak deployment TrackSolid; ok=false + msg mengandung "token" juga indikasi.
  if (body.ok === false) {
    if (body.code === 100 || body.code === 401) return true;
    if (typeof body.msg === "string" && /token|login/i.test(body.msg))
      return true;
  }
  return false;
}

export async function getVehicleLocation(imei: string): Promise<VehicleLocation> {
  if (!/^\d{14,17}$/.test(imei)) {
    throw new Error("Format IMEI tidak valid");
  }

  let session = await getSession();
  let { status, body } = await callMonitorInfo(imei, session);

  if (isAuthError(status, body)) {
    // Token expired → invalidate cache dan retry sekali
    cached = null;
    session = await getSession(true);
    ({ status, body } = await callMonitorInfo(imei, session));
  }

  if (!body.ok) {
    throw new Error(
      `TrackSolid getMonitorInfo gagal: ${body.msg ?? "unknown"} (code ${body.code})`
    );
  }

  return extractFromMonitorInfo(body);
}
