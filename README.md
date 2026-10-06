# TCVA Live Check-In

Version 3 turns the awards-night check-in app into an ongoing TCVA event operations tool. The working Version 2 flow is preserved, while the data model now supports multiple events, archived guest/table records, report snapshots, private award outcomes, communications and in-app staff administration.

## Current Status

- Next.js app with Tablet Check-In Mode and Operations Mode.
- Supabase project configured: `TCVA Sign-in 2026`, project ref `yteynpbwnmywoqfgrrxj`.
- Version 3 migration adds events, archive snapshots, guest types, private award-result fields, feedback email preferences, communications, attachments and email-send logs.
- The original TCVA Awards 2026 event is retained as the first event record.
- Admins can create staff users from the app when `SUPABASE_SERVICE_ROLE_KEY` is configured.
- Feedback emails can be sent from Operations when `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` are configured.
- No real guest import files, passwords, service role keys, email provider keys or database credentials should be committed.

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required browser environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server/admin environment variables:

- `SUPABASE_SERVICE_ROLE_KEY`

Optional email variables:

- `RESEND_API_KEY`
- `EMAIL_FROM_ADDRESS`

Optional database helper variable:

- `SUPABASE_DB_PASSWORD`

## Supabase Schema

Run the migrations in filename order:

1. `supabase/migrations/001_tcva_awards_live_schema.sql`
2. `supabase/migrations/002_editable_seating_and_guest_admin.sql`
3. `supabase/migrations/003_complete_realtime_publication.sql`
4. Continue through each later migration, including:
   - `007_staff_account_activation.sql`
   - `008_guest_creation.sql`
   - `009_v3_events_archive_comms.sql`

Alternative developer route:

```bash
SUPABASE_DB_PASSWORD="your-database-password" npm run db:apply
```

## App Modes

Tablet Check-In Mode:

- fast guest search
- large touch targets
- individual guest check-in
- linked party check-in
- undo check-in with required reason
- table, dietary, accessibility and note display
- live refresh from Supabase Realtime

Operations Mode:

- active-event dashboard with clickable table arrival overviews
- guest creation, search, quick check-in, editing and deletion
- guest type dropdowns and private award result fields
- feedback email opt-in and manual override flags per guest
- seating/table reassignment
- communications tab for feedback/programme emails and attachment links
- event archive tab for new events, archive snapshots and historic table/guest review
- staff access tab with in-app user creation and role management
- CSV exports, QR management and latest audit activity

## Documentation

- Version 3 PRD: `docs/TCVA_Live_Check_In_Version_3_PRD.md`
- Version 2 PRD retained for reference: `docs/TCVA_Awards_2026_Version_2_PRD.md`

## Deployment Notes

Deploy the Next.js app to Vercel and set the public Supabase URL and anon key in Vercel environment variables. Add the service role key only as a server-side Vercel variable for admin user creation and server-side email actions. Add Resend email settings only when the feedback email feature is ready to send live messages.
