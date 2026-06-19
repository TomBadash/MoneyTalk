"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

/** Single Server Action for both sign-in and sign-up, chosen by the
 *  hidden `intent` field. Email + password only (PRD §19.1, email method). */
export async function authenticate(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const intent = String(formData.get("intent") ?? "signin");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "נא למלא אימייל וסיסמה." };
  }

  const supabase = await createClient();

  if (intent === "signup") {
    if (password.length < 6) {
      return { error: "הסיסמה חייבת להכיל לפחות 6 תווים." };
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return { error: error.message };
    }
    // If email confirmation is OFF, a session is returned immediately.
    if (!data.session) {
      return { message: "שלחנו לך אימייל לאישור החשבון. אשר/י ואז התחבר/י." };
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { error: "אימייל או סיסמה שגויים." };
    }
  }

  // redirect() throws to perform the navigation — keep it outside try/catch.
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
