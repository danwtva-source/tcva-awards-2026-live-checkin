# TCVA Awards 2026 Live Check-In - Version 2 PRD

## 1. Product Summary

Version 2 is the live, connected edition of the TCVA Awards 2026 guest check-in system. It keeps the core Version 1 event workflow, but moves the event data into Supabase so multiple devices can operate from the same central data source in real time.

The app is designed around two main operating contexts:

- Tablet Sign-In Mode for front-of-house use on the night.
- Operations Mode for laptop use by event managers before, during and after the event.

Version 2 removes the previously proposed automatic email flow. Instead, guests can scan QR codes to access the final PDF programme and the feedback form.

## 2. Goals

- Allow two separate tablets to check guests in against one central source of truth.
- Keep guest, attendance and seating data secure in Supabase.
- Show updates across connected devices in near real time.
- Let event staff search guests quickly and check in individuals or linked parties.
- Let event managers edit guest details and move guests between tables inside the app.
- Preserve laptop functionality for reporting, audit review and CSV exports.
- Provide QR-code access to the digital programme and feedback form.
- Keep Version 2 separate from the Version 1 static/offline app.

## 3. Out Of Scope

- Automatic emails to guests.
- Public guest self-check-in.
- Payment, ticketing or public registration.
- Automated feedback-form creation.
- Editing the printed PDF programme.

## 4. Users And Roles

| User Type | Main Need | Access |
| --- | --- | --- |
| Check-in staff | Find guests and mark arrivals quickly on tablets. | Active staff account. |
| Event manager | Manage seating, edit guests, view reporting and export data. | Event manager or admin role. |
| Admin | First setup, staff activation and full project administration. | Admin role plus Supabase dashboard access. |
| Guest | Access programme and feedback form by scanning QR codes. | Public access to hosted links only. |

## 5. Environments

| Layer | Chosen Product | Purpose |
| --- | --- | --- |
| Frontend | Next.js | Single responsive app with tablet and operations modes. |
| Hosting | Vercel | Production deployment and environment-variable management. |
| Database | Supabase Postgres | Central guest, seating, audit and attendance data. |
| Authentication | Supabase Auth | Staff sign-in and account sessions. |
| Live Sync | Supabase Realtime | Cross-device refresh for guest, attendance and seating changes. |

## 6. Implemented Application Structure

| Area | Implementation |
| --- | --- |
| App shell | `app/layout.jsx`, `app/page.jsx`, `components/CheckInApp.jsx` |
| Styling | `app/globals.css` |
| Supabase client | `lib/supabaseClient.js` |
| CSV utilities | `lib/csv.js` |
| Formatting utilities | `lib/format.js` |
| Data import | `scripts/prepare-final-data.py` |
| Database migrations | `supabase/migrations/*.sql` |

## 7. Tablet Sign-In Mode Requirements

| Requirement | Status |
| --- | --- |
| Large touch-friendly interface | Implemented |
| Search by name, table, organisation, role, notes and contact fields | Implemented |
| Show table assignment prominently | Implemented |
| Show dietary and accessibility notes | Implemented |
| Show linked party members | Implemented |
| Check in one guest | Implemented |
| Check in whole linked party | Implemented |
| Undo check-in with reason | Implemented |
| Refresh automatically when another device makes a change | Implemented via Supabase Realtime |
| Device label for audit traceability | Implemented with local storage |

## 8. Operations Mode Requirements

| Requirement | Status |
| --- | --- |
| Dashboard totals | Implemented |
| Category attendance summary | Implemented |
| Table attendance summary | Implemented |
| Clickable table overview showing arrived and outstanding guests | Implemented |
| Guest search | Implemented |
| Quick guest check-in from the Guests view | Implemented |
| Add guest with table and linked-party assignment | Implemented |
| Guest detail editing | Implemented |
| Guest table reassignment | Implemented |
| Seating plan view grouped by table | Implemented |
| CSV guest export | Implemented |
| CSV seating export | Implemented |
| CSV attendance-event export | Implemented |
| QR-code management for programme link | Implemented and seeded |
| QR-code management for feedback link | Implemented, awaiting final URL |
| Latest audit log view | Implemented |

## 9. Data Model

| Table/View | Purpose |
| --- | --- |
| `staff_profiles` | Staff role, active state and account link to Supabase Auth users. |
| `event_tables` | Tables, labels, capacity and ordering. |
| `guest_parties` | Linked guest groupings for party check-in. |
| `import_batches` | Import provenance, counts and warnings. |
| `guests` | Guest, seating, attendance, dietary, accessibility and contact records. |
| `attendance_events` | Immutable check-in, party check-in and undo event history. |
| `audit_log` | Guest and seating management audit trail. |
| `event_assets` | Programme PDF and other event asset links. |
| `feedback_links` | Feedback form URL records. |
| `app_settings` | Small app configuration values. |
| `dashboard_attendance_summary` | Dashboard aggregate view. |
| `category_attendance_summary` | Attendance by award/category. |
| `table_attendance_summary` | Attendance and notes by table. |
| `seating_plan_export` | Export-ready seating and guest data. |

## 10. Database Functions

| Function | Purpose |
| --- | --- |
| `claim_first_admin` | Allows the first active admin profile to be claimed securely. |
| `record_attendance_action` | Records check-in, undo and attendance status changes. |
| `record_party_attendance_action` | Checks in linked parties together. |
| `upsert_event_table` | Creates or updates table records. |
| `assign_guest_table` | Moves a guest to a new table or TBC. |
| `assign_party_table` | Moves all guests in a linked party to a new table. |
| `update_guest_details` | Updates editable guest fields and writes audit history. |

## 11. Security Requirements

- Supabase Row Level Security must remain enabled on app tables.
- Only authenticated active staff can read event data.
- Only event managers/admins can manage guest and seating data.
- Only admins can fully manage audit data.
- Service role keys and database passwords must not be committed or exposed in browser code.
- Real guest data imports and generated SQL are excluded from git.
- The public frontend may use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Staff accounts should use strong passwords and be limited to named event staff.
- The database password should be rotated after setup because it was shared during assisted configuration.

## 12. Realtime Requirements

Supabase Realtime is enabled for:

- `guests`
- `attendance_events`
- `event_tables`
- `guest_parties`
- `app_settings`

The frontend subscribes to these tables and reloads the current app data when changes arrive.

## 13. Final Data Import

The final workbook import was prepared from the supplied invitation list and table plan workbook. The import output was applied to Supabase and verified with aggregate counts.

| Imported Area | Verified Count |
| --- | ---: |
| Event tables | 20 |
| Guest parties | 223 |
| Guests | 230 |
| Programme assets | 1 |
| Feedback links | 0 |
| Realtime publication tables | 5 |

The feedback link count is currently zero by design, because the final feedback form URL has not yet been supplied.

One workbook data-quality warning remains in the private validation output: one source row contains an unusual table value of `173`. This should be checked against the final seating plan before event night.

## 14. QR Code Flow

| QR Code | Behaviour |
| --- | --- |
| Digital programme | Shows a QR code generated from the final programme PDF download URL. |
| Feedback form | Shows a placeholder until the final feedback form URL is added. |

The programme link is seeded in Supabase as `event_assets.asset_key = 'programme_pdf'`.

The feedback form can be added in Operations Mode under `QR links`. Once saved, the app displays the QR code immediately.

## 15. CSV Export Requirements

| Export | Contents |
| --- | --- |
| Guest list | Name, table, attendance, confirmation, organisation, category, dietary, accessibility, phone and email. |
| Seating plan | Export-ready rows from `seating_plan_export`. |
| Attendance events | Latest attendance-event records for audit/reconciliation. |

Exports run in the browser and download CSV files locally.

## 16. Deployment Requirements

Vercel environment variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key for authenticated browser sessions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Server-only use only. Do not expose client-side. |

Build command:

```bash
npm run build
```

Development command:

```bash
npm run dev
```

## 17. Launch Runbook

1. Confirm Supabase migrations `001`, `002` and `003` are applied.
2. Confirm Vercel has the correct public Supabase environment variables.
3. Deploy the `main` branch to Vercel.
4. Create the first app user in the deployed app.
5. Claim first admin access.
6. Create/activate any additional check-in staff profiles.
7. Add the final feedback form URL in Operations Mode once available.
8. Open the deployed app on both tablets and one laptop.
9. Confirm both tablets show the same guest counts.
10. Run a test guest check-in on one device and verify the other device updates.
11. Undo the test check-in with a reason and verify the audit trail.
12. Test moving one guest to another table and verify the tablet view updates.
13. Add a test guest, confirm the guest appears on both tablets, then remove the test record.
14. Export guest, seating and attendance CSV files.
15. Rotate the Supabase database password after setup is complete.

## 18. Acceptance Criteria

- Two tablets can sign in and see the same central guest list.
- A guest checked in on Tablet A appears as arrived on Tablet B without manual data transfer.
- A linked party can be checked in together.
- Undo requires a reason and writes an attendance/audit record.
- Operations Mode can edit guest information.
- Operations Mode can check in a guest directly from the Guests view.
- Operations Mode can add a guest with an optional table and linked-party assignment.
- Operations Mode can move a guest to a different table.
- Seating changes appear on tablet search and guest detail views.
- Dashboard and summaries reflect live attendance.
- Each dashboard table card opens a live overview of arrived and outstanding guests at that table.
- CSV exports download successfully.
- Programme QR code opens the final programme PDF link.
- Feedback QR code appears after the final feedback URL is entered.
- Build succeeds locally and on Vercel.

## 19. Open Items

- Final feedback form URL still needs to be provided and saved in Operations Mode.
- First admin and any staff user accounts still need to be created/activated for event use.
- Vercel production deployment still needs to be completed with environment variables.
- The workbook row with unusual table value `173` should be checked privately before event night.
- A final on-device rehearsal should be completed with the actual tablets and laptop.
