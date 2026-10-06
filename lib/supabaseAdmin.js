import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw Object.assign(new Error("Supabase admin environment variables are not configured."), { status: 500 });
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireStaffRole(request, allowedRoles = ["admin"]) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    throw Object.assign(new Error("A signed-in staff session is required."), { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    throw Object.assign(new Error("The staff session could not be verified."), { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles")
    .select("*")
    .eq("user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();

  if (profileError || !profile) {
    throw Object.assign(new Error("Active staff access is required."), { status: 403 });
  }

  if (!allowedRoles.includes(profile.role)) {
    throw Object.assign(new Error("Your staff role cannot perform this action."), { status: 403 });
  }

  return { supabase, user: userData.user, profile };
}

export function errorResponse(error) {
  return Response.json({ error: error.message || "Request failed." }, { status: error.status || 500 });
}
