# TCVA Live Check-In - Version 3 PRD

## 1. Product Summary

Version 3 converts the TCVA awards-night check-in app into an ongoing event management tool. The proven Version 2 live check-in workflow remains intact, but the system is no longer tied to one year. It now supports active and archived events, reusable event setup, guest and table-plan archives, private award outcomes, feedback communications, report snapshots and in-app staff administration.

## 2. Goals

- Keep the successful tablet check-in workflow stable for future events.
- Remove year-specific app branding from the main product title.
- Retain the TCVA Awards 2026 event as a complete historic event record.
- Allow administrators to create a new event from the previous TCVA structure.
- Archive guest records, table plans, attendance data, dashboard metrics and audit history by event.
- Allow archived guest records to remain searchable and editable for missing fields or future planning.
- Add structured guest types, such as Finalist, Nominator, Sponsor, Guest, Staff and VIP.
- Store winner and runner-up data privately in the guest record without exposing it in guest-facing check-in views.
- Support opt-in and manual override decisions for feedback email sending.
- Allow event staff to manage feedback/programme email content and attachment links in Operations Mode.
- Allow admins to create and activate staff users from inside the app.
- Add a report directory that extends the existing CSV export suite with practical event review, operational and data-quality reports.

## 3. Out Of Scope

- Public self-registration.
- Payment, ticketing or seat purchase workflows.
- Public display of winners, runners-up or embargoed award outcomes.
- Editing PDF programme content inside the app.
- Email sending without a configured server-side email provider.

## 4. Users And Roles

| User Type | Main Need | Access |
| --- | --- | --- |
| Check-in staff | Search guests and mark arrivals quickly on tablets. | Active staff account. |
| Event manager | Manage guests, seating, communications, dashboard and archives. | Event manager or admin role. |
| Admin | Create staff users, activate accounts, manage events and full operations. | Admin role plus server-side configuration. |
| Guest | Arrive at event and optionally receive follow-up links. | No app login. |

## 5. Environments

| Layer | Product | Purpose |
| --- | --- | --- |
| Frontend | Next.js | Responsive app with check-in and operations modes. |
| Hosting | Vercel | Production deployment and server-side admin routes. |
| Database | Supabase Postgres | Guests, events, tables, audit, reports and communication records. |
| Authentication | Supabase Auth | Staff sign-in and account sessions. |
| Live Sync | Supabase Realtime | Cross-device updates. |
| Optional Email | Resend API | Server-side feedback email sending. |

## 6. Implemented Application Structure

| Area | Implementation |
| --- | --- |
| App shell | `app/layout.jsx`, `app/page.jsx`, `components/CheckInApp.jsx` |
| Styling | `app/globals.css` |
| Supabase browser client | `lib/supabaseClient.js` |
| Supabase admin helper | `lib/supabaseAdmin.js` |
| Staff creation API | `app/api/admin/create-staff-user/route.js` |
| Feedback email API | `app/api/admin/send-feedback-emails/route.js` |
| CSV utilities | `lib/csv.js` |
| Formatting utilities | `lib/format.js` |
| Report export utilities | `lib/reportExports.js` |
| Version 3 migration | `supabase/migrations/009_v3_events_archive_comms.sql` |

## 7. Core Version 3 Requirements

| Requirement | Status |
| --- | --- |
| Remove 2026 from main app title | Implemented |
| Rename tablet mode from Sign-In to Check-In | Implemented |
| Add events table and active event model | Implemented |
| Preserve 2026 event data under an event record | Implemented via migration |
| Archive event with report snapshot | Implemented |
| Create new event from previous TCVA table/asset structure | Implemented |
| View archived event guest lists and table assignments | Implemented |
| Edit archived guest records for missing fields | Implemented |
| Add guest type dropdown | Implemented |
| Store private winner/runner-up fields | Implemented |
| Hide private outcome fields from tablet check-in mode | Implemented |
| Add feedback email opt-in and manual override fields | Implemented |
| Configure feedback email, programme link and attachment links | Implemented |
| Send feedback emails server-side when provider is configured | Implemented |
| Add staff user from app as admin | Implemented |
| Retain dashboard metrics in report archive | Implemented |
| Add export/report directory with useful report explanations | Implemented |

## 8. Data Model Additions

| Table | Purpose |
| --- | --- |
| `events` | Stores every event, its status, date, venue and archive state. |
| `guest_types` | Lookup values for structured guest classifications. |
| `event_report_snapshots` | Stores dashboard/report metrics as JSON snapshots. |
| `event_communications` | Stores event email subject, body and core link settings. |
| `event_attachments` | Stores additional attachment/link records for communications. |
| `email_send_log` | Stores send outcomes, failures and manual override flags. |

Version 3 also adds `event_id` to event-scoped records, including guests, tables, parties, assets, feedback links, attendance events and audit log records.

## 9. Guest Record Additions

| Field | Purpose | Visibility |
| --- | --- | --- |
| `guest_type` | Structured type such as finalist, nominator or sponsor. | Operations and exports. |
| `award_result` | Private award status such as winner or runner-up. | Operations and manager exports only. |
| `award_result_notes` | Private award/admin notes. | Operations and manager exports only. |
| `feedback_email_opt_in` | Whether the guest should receive feedback emails. | Operations only. |
| `feedback_email_override` | Manual override to send despite normal opt-out state. | Operations only. |

Tablet Check-In Mode does not display `award_result` or `award_result_notes`.

## 10. Event Archive Flow

1. Active event data is managed through the normal check-in and operations screens.
2. An event manager or admin can create a report snapshot at any point.
3. When the event is finished, an event manager or admin can archive the event.
4. Archiving stores a final report snapshot and marks the event as archived.
5. Archived events remain available in Operations for guest lookup, table-plan review and record completion.
6. A new event can be created from the prior event's table and asset structure, then activated when ready.

## 11. Communications Flow

1. Event staff enter or update the programme URL and feedback form URL.
2. Event staff configure the email subject and body.
3. Additional hosted attachments can be added as labelled links.
4. Guests with an email address and opt-in status are included.
5. Guests marked with manual override are included even where an override is needed.
6. Sending requires server-side `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`.
7. Each send attempt is written to `email_send_log`.

## 12. Reports And Export Directory

The Exports tab includes the original export suite and a report directory. Each report card explains why the report is useful and provides a CSV download for the active event.

| Report | Why it is useful |
| --- | --- |
| Event summary report | Total guests, arrived, not arrived and attendance rate. Useful for a quick post-event summary and headline reporting. |
| Table performance report | Assigned, arrived, not arrived and completion rate by table. Useful for spotting table-level no-shows and seating gaps. |
| Arrival timeline | Check-ins by hour or 15-minute window. Useful for planning staffing, reception flow and tablet placement next year. |
| Device and staff audit | Check-ins by device type and staff account, plus undo counts. Useful for operational review and troubleshooting. |
| No-show report | No-shows by table, category, organisation and guest type. Useful for follow-up, future invite planning and data cleansing. |
| Dietary and accessibility operations report | Counts and details by table, especially who has arrived or is still outstanding. Useful for front-of-house and venue coordination. |
| Data quality report | Missing email, phone, category, organisation, seating and duplicate records. Useful before each event to clean the guest list. |
| Seating completeness report | Assigned seats, TBC or unassigned seats, missing seat order and table fill levels. Useful for table-plan checks before the event. |
| Party and group report | Linked guest group size and partial-arrival status. Useful where nominators, finalists, guests and plus-ones should be reviewed together. |

## 13. Security Requirements

- Supabase Row Level Security remains enabled.
- Only authenticated active staff can read event data.
- Event managers and admins can manage guest, event, table, archive and communication data.
- Only admins can create staff users from the app.
- Service role and email provider keys must remain server-side only.
- Private award outcomes must not appear in tablet check-in views.
- Feedback email sends must be logged.

## 14. Deployment Requirements

Required Vercel variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key for authenticated browser sessions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for staff creation/email | Server-only. |
| `RESEND_API_KEY` | Only for email sending | Server-only. |
| `EMAIL_FROM_ADDRESS` | Only for email sending | Verified sender address. |

Build command:

```bash
npm run build
```

Development command:

```bash
npm run dev
```

## 15. Acceptance Criteria

- The app title displays as TCVA Live Check-In.
- Tablet mode is labelled Check-In.
- The existing event can still be used for live guest check-in.
- Admins can create a new event from the current TCVA structure.
- Event managers/admins can archive an event and retrieve its guests, table plan and snapshots.
- Guest type can be selected from a dropdown.
- Private award results can be stored without appearing in check-in mode.
- Feedback email settings can be saved and attachment links added.
- Email sends fail safely if provider settings are missing.
- Admins can create staff users from Operations.
- The Exports tab displays the current CSV suite and useful report directory with explanatory cards and CSV downloads.
