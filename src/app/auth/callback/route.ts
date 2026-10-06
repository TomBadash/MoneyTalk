import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the link Supabase emails for account confirmation / magic links.
// Exchanges the `code` for a session cookie, then redirects into the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only same-origin absolute paths: "/x" is fine, "//evil.com" and "https://…" are not (open-redirect guard).
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
