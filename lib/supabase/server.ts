import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Override fetch with `cache: 'no-store'` so Next.js 14 tidak cache hasil
// Supabase REST queries antar request — fresh data tiap render.
function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: "no-store" });
}

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as CookieOptions)
            );
          } catch {
            // In Server Components, set is unavailable. Middleware handles refresh.
          }
        }
      },
      global: { fetch: noStoreFetch }
    }
  );
}

/**
 * Anonymous client without cookie context — for public endpoints like the
 * customer tracking page, where RLS lets unauthenticated users read by token.
 */
export function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          /* no-op */
        }
      },
      global: { fetch: noStoreFetch }
    }
  );
}
