/**
 * Mengenali isi kotak cari di pemilih lokasi: titik koordinat, link Google
 * Maps, atau teks alamat biasa (diteruskan ke pencarian Nominatim).
 */

export type LokasiInput =
  | { kind: "koordinat"; lat: number; lng: number }
  /** Link pendek (maps.app.goo.gl) — koordinat baru ada setelah redirect di-resolve backend. */
  | { kind: "link-pendek"; url: string }
  /** Link Google Maps tanpa koordinat; `query` = nama tempat/alamat bila ada. */
  | { kind: "link-tanpa-koordinat"; query: string | null }
  | { kind: "teks"; query: string };

function titikValid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

// Wajib berdesimal supaya teks alamat seperti "Blok 12 45" tidak dianggap koordinat.
const ANGKA = String.raw`[-+]?\d{1,3}\.\d+`;
const RE_DESIMAL = new RegExp(String.raw`^\s*(${ANGKA})\s*[,;\s]\s*(${ANGKA})\s*$`);
// Format DMS yang ditampilkan Google Maps, mis. 6°12'31.7"S 106°50'44.2"E
const RE_DMS =
  /(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["″]|'')?\s*([NSUEWTB])/gi;

function dmsKeDesimal(d: string, m: string, s: string, arah: string): number {
  const nilai = Number(d) + Number(m) / 60 + Number(s.replace(",", ".")) / 3600;
  // S (selatan) & W/B (barat) bernilai negatif; U = utara, T = timur.
  return /[SWB]/i.test(arah) ? -nilai : nilai;
}

/** "-6.2088, 106.8456" / "-6.2088 106.8456" / 6°12'31.7"S 106°50'44.2"E */
export function parseKoordinat(teks: string): { lat: number; lng: number } | null {
  const desimal = RE_DESIMAL.exec(teks);
  if (desimal) {
    const lat = Number(desimal[1]);
    const lng = Number(desimal[2]);
    return titikValid(lat, lng) ? { lat, lng } : null;
  }

  const bagian = [...teks.matchAll(RE_DMS)];
  if (bagian.length === 2) {
    const [a, b] = bagian;
    let lat = dmsKeDesimal(a[1], a[2], a[3], a[4]);
    let lng = dmsKeDesimal(b[1], b[2], b[3], b[4]);
    // Urutan bisa terbalik (bujur dulu) — tentukan dari huruf arahnya.
    if (/[EWTB]/i.test(a[4]) && /[NSU]/i.test(b[4])) [lat, lng] = [lng, lat];
    return titikValid(lat, lng) ? { lat, lng } : null;
  }
  return null;
}

function hostGoogleMaps(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "maps.app.goo.gl" ||
    h === "goo.gl" ||
    h === "g.co" ||
    /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h)
  );
}

function linkPendek(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return (
    h === "maps.app.goo.gl" ||
    (h === "goo.gl" && u.pathname.startsWith("/maps")) ||
    (h === "g.co" && u.pathname.startsWith("/kgs"))
  );
}

function decodeAman(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function bersihkan(s: string): string {
  return decodeAman(s.replace(/\+/g, " ")).trim();
}

/** Ambil koordinat dari URL Google Maps versi panjang. */
export function koordinatDariUrlGoogle(
  u: URL
): { lat: number; lng: number } | null {
  const penuh = decodeAman(u.href);

  // 1. Titik tempat yang dipilih (!3d<lat>!4d<lng>) — paling akurat.
  const pin = [...penuh.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)].pop();
  if (pin) {
    const lat = Number(pin[1]);
    const lng = Number(pin[2]);
    if (titikValid(lat, lng)) return { lat, lng };
  }

  // 2. Parameter berisi koordinat: ?q=, ?query=, ?ll=, ?destination=, ...
  for (const key of ["q", "query", "ll", "destination", "daddr", "center", "sll"]) {
    const v = u.searchParams.get(key);
    if (v) {
      const k = parseKoordinat(v.replace(/^loc:/i, ""));
      if (k) return k;
    }
  }

  // 3. Path /maps/search/<lat>,<lng> atau /maps/place/<lat>,<lng>
  for (const seg of u.pathname.split("/")) {
    const k = parseKoordinat(bersihkan(seg));
    if (k) return k;
  }

  // 4. Pusat tampilan peta @<lat>,<lng>,<zoom>z
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(penuh);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (titikValid(lat, lng)) return { lat, lng };
  }
  return null;
}

/** Nama tempat / alamat dari link Google Maps yang tidak memuat koordinat. */
function queryDariUrlGoogle(u: URL): string | null {
  for (const key of ["q", "query", "destination", "daddr"]) {
    const v = u.searchParams.get(key);
    if (v?.trim()) return v.trim();
  }
  const place = /\/maps\/(?:place|search)\/([^/]+)/.exec(u.pathname);
  return place ? bersihkan(place[1]) || null : null;
}

function keUrl(teks: string): URL | null {
  const t = teks.trim();
  if (/\s/.test(t)) return null;
  try {
    return new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
}

export function parseLokasiInput(teks: string): LokasiInput {
  const t = teks.trim();

  const koordinat = parseKoordinat(t);
  if (koordinat) return { kind: "koordinat", ...koordinat };

  const u = keUrl(t);
  if (u && hostGoogleMaps(u.hostname)) {
    if (linkPendek(u)) return { kind: "link-pendek", url: u.href };
    const k = koordinatDariUrlGoogle(u);
    if (k) return { kind: "koordinat", ...k };
    return { kind: "link-tanpa-koordinat", query: queryDariUrlGoogle(u) };
  }

  return { kind: "teks", query: t };
}
