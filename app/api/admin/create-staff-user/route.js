import { errorResponse, requireStaffRole } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const { supabase } = await requireStaffRole(request, ["admin"]);
    const payload = await request.json();
    const email = String(payload.email || "").trim().toLowerCase();
    const fullName = String(payload.full_name || "").trim();
    const role = payload.role || "check_in";
    const active = payload.active !== false;
    const sendInvite = payload.send_invite !== false;
    const password = String(payload.password || "").trim();

    if (!email) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    if (!["check_in", "event_manager", "admin"].includes(role)) {
      return Response.json({ error: "Invalid staff role." }, { status: 400 });
    }

    if (!sendInvite && password.length < 8) {
      return Response.json({ error: "Temporary passwords must be at least 8 characters." }, { status: 400 });
    }

    const authResult = sendInvite
      ? await supabase.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName || email.split("@")[0] },
        })
      : await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || email.split("@")[0] },
        });

    if (authResult.error) {
      return Response.json({ error: authResult.error.message }, { status: 400 });
    }

    const user = authResult.data.user;
    const { error: profileError } = await supabase.from("staff_profiles").upsert(
      {
        user_id: user.id,
        email,
        full_name: fullName || email.split("@")[0],
        role,
        active,
      },
      { onConflict: "user_id" },
    );

    if (profileError) {
      return Response.json({ error: profileError.message }, { status: 400 });
    }

    return Response.json({
      user_id: user.id,
      email,
      role,
      active,
      invited: sendInvite,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
