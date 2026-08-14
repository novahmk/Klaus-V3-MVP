import { createClient } from "@supabase/supabase-js";

/** Cliente Supabase com service_role key — só deve ser usado no servidor. */
export function getSupabase() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (url === undefined || url.trim().length === 0) {
    throw new Error("SUPABASE_URL não configurada no ambiente do dashboard.");
  }

  if (key === undefined || key.trim().length === 0) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente do dashboard.");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}
