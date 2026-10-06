import { errorResponse, requireStaffRole } from "@/lib/supabaseAdmin";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function linkBlock(label, url) {
  if (!url) return "";
  return `<p><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></p>`;
}

function buildHtml({ body, guest, communication, attachments }) {
  const lines = [
    `<p>Hello ${escapeHtml(guest.full_name || "there")},</p>`,
    ...String(body || "")
      .split(/\n+/)
      .filter(Boolean)
      .map((line) => `<p>${escapeHtml(line)}</p>`),
    communication.include_feedback ? linkBlock("Complete the feedback form", communication.feedback_url) : "",
    communication.include_programme ? linkBlock("View the programme", communication.programme_url) : "",
    ...attachments.map((attachment) => linkBlock(attachment.label, attachment.url)),
  ].filter(Boolean);

  return `<div>${lines.join("\n")}</div>`;
}

export async function POST(request) {
  try {
    const { supabase, user } = await requireStaffRole(request, ["admin", "event_manager"]);
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.EMAIL_FROM_ADDRESS;
    const payload = await request.json();
    const eventId = payload.event_id;
    const communicationId = payload.communication_id;

    if (!eventId) {
      return Response.json({ error: "Event ID is required." }, { status: 400 });
    }

    const { data: communication, error: communicationError } = await supabase
      .from("event_communications")
      .select("*")
      .eq("event_id", eventId)
      .eq("id", communicationId)
      .maybeSingle();

    if (communicationError || !communication) {
      return Response.json({ error: communicationError?.message || "Email settings were not found for this event." }, { status: 400 });
    }

    const [{ data: guests, error: guestsError }, { data: attachments, error: attachmentsError }] = await Promise.all([
      supabase.from("guests").select("id, full_name, email, feedback_email_opt_in, feedback_email_override").eq("event_id", eventId).order("full_name"),
      supabase.from("event_attachments").select("*").eq("event_id", eventId).eq("active", true).order("display_order"),
    ]);

    if (guestsError || attachmentsError) {
      return Response.json({ error: guestsError?.message || attachmentsError?.message }, { status: 400 });
    }

    const recipients = (guests || []).filter((guest) => guest.email && (guest.feedback_email_override || guest.feedback_email_opt_in !== false));
    const skipped = (guests || []).filter((guest) => !guest.email || (!guest.feedback_email_override && guest.feedback_email_opt_in === false)).length;

    if (!resendApiKey || !fromEmail) {
      return Response.json(
        {
          error: "Email provider is not configured. Add RESEND_API_KEY and EMAIL_FROM_ADDRESS in Vercel before sending.",
          sent: 0,
          failed: 0,
          skipped,
        },
        { status: 501 },
      );
    }

    let sent = 0;
    let failed = 0;
    const logRows = [];

    for (const guest of recipients) {
      const html = buildHtml({
        body: communication.body,
        guest,
        communication,
        attachments: attachments || [],
      });

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: guest.email,
          subject: communication.subject,
          html,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (response.ok) sent += 1;
      else failed += 1;

      logRows.push({
        event_id: eventId,
        communication_id: communication.id,
        guest_id: guest.id,
        recipient_email: guest.email,
        recipient_name: guest.full_name,
        subject: communication.subject,
        status: response.ok ? "sent" : "failed",
        manual_override: Boolean(guest.feedback_email_override),
        provider_message_id: result.id || null,
        error_message: response.ok ? null : result.message || result.error || "Email provider rejected this message.",
        sent_at: response.ok ? new Date().toISOString() : null,
        created_by_user_id: user.id,
      });
    }

    if (logRows.length) {
      await supabase.from("email_send_log").insert(logRows);
    }

    return Response.json({ sent, failed, skipped });
  } catch (error) {
    return errorResponse(error);
  }
}
