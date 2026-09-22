/**
 * Ambil IMEI dari URL share link TrackSolid.
 *
 * Format yang ditemui (per investigasi DevTools):
 *   https://www.tracksolidpro.com/resource/dev/index.html?t=247132#/monitorTracking?imei=353701093101554&googleMapRegion=
 *
 * IMEI device GPS = 15 digit (standard GSMA). Beberapa link TrackSolid
 * meletakkan parameter di hash fragment (#/path?imei=...), bukan di query
 * standar, jadi URL constructor saja tidak cukup — kita scan keseluruhan
 * string dengan regex.
 */
export function extractImeiFromTrackSolidLink(input: string): string | null {
  if (!input) return null;
  const match = input.match(/imei=(\d{14,17})/i);
  return match ? match[1] : null;
}

/**
 * Smart parser untuk field tracking di form unit. User boleh:
 *   - Ketik IMEI 15-17 digit langsung
 *   - Atau paste URL TrackSolid lengkap → kita extract IMEI darinya
 *
 * Return:
 *   imei: IMEI yang valid (atau null kalau input tidak bisa di-parse)
 *   shareLink: URL mentah kalau user paste link, null kalau ketik IMEI langsung
 */
export function parseTrackingInput(raw: string): {
  imei: string | null;
  shareLink: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { imei: null, shareLink: null };

  // Kasus 1: input adalah IMEI murni (cuma digit, 14-17 char)
  if (/^\d{14,17}$/.test(trimmed)) {
    return { imei: trimmed, shareLink: null };
  }

  // Kasus 2: input mengandung URL TrackSolid → extract IMEI
  const imei = extractImeiFromTrackSolidLink(trimmed);
  if (imei) return { imei, shareLink: trimmed };

  // Tidak bisa di-parse
  return { imei: null, shareLink: null };
}
