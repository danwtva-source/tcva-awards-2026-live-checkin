# TCVA Awards 2026 Live Check-In

Version 2 of the TCVA Awards 2026 check-in app will use Supabase and Vercel for secure central storage, live two-tablet synchronisation and laptop-friendly event operations.

This repository is deliberately separate from the Version 1 local/offline app.

## Current Status

- Supabase project created: `TCVA Sign-in 2026`
- Supabase project ID: `yteynpbwnmywoqfgrrxj`
- Region: West Europe (London)
- Initial database schema prepared in `supabase/migrations/001_tcva_awards_live_schema.sql`
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

## Supabase Setup

The schema migration creates:

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

It also creates helper functions for check-in actions, Row Level Security policies, summary views and Supabase Realtime publication entries.

## Applying The Schema

Preferred route:

1. Open Supabase.
2. Go to `SQL Editor`.
3. Create a new query.
4. Paste the contents of `supabase/migrations/001_tcva_awards_live_schema.sql`.
5. Run the query.

Alternative developer route:

```bash
npm install
SUPABASE_DB_PASSWORD="your-database-password" npm run db:apply
```

Do not commit `.env.local`, database passwords, service role keys or guest spreadsheets.

## Environment Variables

Use `.env.example` as the template for Vercel and local development.

The browser app should only use:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only operations may use:

- `SUPABASE_SERVICE_ROLE_KEY`

The service role key must never be exposed in client-side code.

## Next Build Steps

1. Apply the Supabase migration.
2. Create the first admin user in Supabase Auth.
3. Import the final guest workbook into Supabase.
4. Build the Next.js app with two modes: Sign-In Mode and Operations Mode.
5. Connect Supabase Realtime for live tablet updates.
6. Add QR link management for the programme PDF and feedback form.
7. Deploy to Vercel with environment variables set securely.
8. Test two tablets and one laptop before event night.
