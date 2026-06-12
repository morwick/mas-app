import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/reset-password", "/driver/login"];
const PUBLIC_PREFIXES = [
  "/track/",
  "/api/tracking/",
  "/_next/",
  "/favicon"
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicPath =
    PUBLIC_PATHS.includes(path) ||
    PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  // Check if accessing driver portal
  const isDriverPath = path.startsWith("/driver");
  
  if (!user && !isPublicPath) {
    if (isDriverPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/driver/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Redirect logged-in users away from login pages
  if (user) {
    if (path === "/login" || path.startsWith("/reset-password")) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    
    // Check user role and redirect accordingly
    if (isDriverPath && path !== "/driver/login") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      
      if (profile?.role !== "driver" && path.startsWith("/driver")) {
        // Non-drivers cannot access driver portal
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    }
    
    // Redirect drivers trying to access admin dashboard
    if (!isDriverPath && path.startsWith("/dashboard")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      
      if (profile?.role === "driver") {
        const url = request.nextUrl.clone();
        url.pathname = "/driver";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
