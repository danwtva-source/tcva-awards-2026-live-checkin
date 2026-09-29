# TCVA Awards 2026 Live Check-In

Version 2 of the TCVA Awards 2026 check-in app will use Supabase and Vercel for secure central storage, live two-tablet synchronisation and laptop-friendly event operations.

This repository is deliberately separate from the Version 1 local/offline app.

## Current Status

- Supabase project created: `TCVA Sign-in 2026`
- Supabase project ID: `yteynpbwnmywoqfgrrxj`
- Region: West Europe (London)
- Base database schema prepared in `supabase/migrations/001_tcva_awards_live_schema.sql`
- Editable seating and guest-admin support prepared in `supabase/migrations/002_editable_seating_and_guest_admin.sql`
- No real guest data, passwords, service role keys or database credentials should be committed to this repository.

## Version 2 Scope

### Tablet Sign-In Mode

- Fast guest search
- Linked-party view
- Individual check-in
- Party check-in
- Undo check-in with reason
- Table number display
- Dietary and accessibility notes
- Live connection/status indicator
- Large touch targets for event-night use

### Laptop Operations Mode

- Live dashboard
- Attendance summary
- Category attendance
- Table attendance
- Outstanding guest list
- Audit log
- CSV exports
- Guest/table data management
- QR link management for the PDF programme and feedback form

### Editable Seating And Guest Admin

The app should support editable seating and guest information in Operations Mode:

- edit guest names, organisation, role and category fields
- edit contact, dietary and accessibility notes
- assign a guest to another table
- assign a linked party to another table
- create or update table records
- keep all seating and guest-detail edits in the audit log
- update connected tablets in real time when seating changes

## Supabase Setup

The schema creates:

- `staff_profiles`
- `event_tables`
- `guest_parties`
- `import_batches`
- `guests`
- `attendance_events`
- `audit_log`
- `event_assets`
- `feedback_links`
- `app_settings`

It also creates helper functions for check-in actions, editable seating, guest administration, Row Level Security policies, summary views and Supabase Realtime publication entries.

## Applying The Schema

Preferred route:

1. Open Supabase.
2. Go to `SQL Editor`.
3. Run `supabase/migrations/001_tcva_awards_live_schema.sql`.
4. Run `supabase/migrations/002_editable_seating_and_guest_admin.sql`.

Run them in filename order.

Alternative developer route:

```bash
npm install
SUPABASE_DB_PASSWORD="your-database-password" npm run db:apply
```

The helper applies all SQL files in `supabase/migrations` in filename order.

Do not commit `.env.local`, database passwords, service role keys or guest spreadsheets.

## Latest Event Materials Reviewed

The latest table-plan workbook uses:

- structured source tabs for finalists, judges, sponsors, staff and communications
- `Table No` fields in source tabs
- a visual `Table Plan` grid across Tables 1 to 19
- some structured references to Table 20 and unassigned/zero-style values

The app should treat source `Table No` values as import data and the visual grid as a reference/check.

The final PDF programme is the print version. A compressed digital copy or hosted URL should be used for the guest QR code.

## Environment Variables

Use `.env.example` as the template for Vercel and local development.

The browser app should only use:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only operations may use:

- `SUPABASE_SERVICE_ROLE_KEY`

The service role key must never be exposed in client-side code.

## Next Build Steps

1. Apply both Supabase migrations.
2. Create the first admin user in Supabase Auth.
3. Import the final guest workbook into Supabase.
4. Build the Next.js app with two modes: Sign-In Mode and Operations Mode.
5. Add editable guest and table-management screens.
6. Connect Supabase Realtime for live tablet updates.
7. Add QR link management for the programme PDF and feedback form.
8. Deploy to Vercel with environment variables set securely.
9. Test two tablets and one laptop before event night.
