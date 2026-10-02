# TCVA Awards 2026 Live Check-In

Version 2 of the TCVA Awards 2026 check-in app is the connected Supabase and Vercel build for secure central storage, live two-tablet synchronisation and laptop-friendly event operations.

This repository is deliberately separate from the Version 1 local/offline app.

## Current Status

- Next.js app implemented with Tablet Sign-In Mode and Operations Mode.
- Supabase project configured: `TCVA Sign-in 2026`, project ref `yteynpbwnmywoqfgrrxj`.
- Schema migrations are in `supabase/migrations`.
- Final workbook import has been prepared and applied to Supabase.
- Final programme PDF URL has been seeded as the active digital programme asset.
- Feedback form QR remains ready but empty until the final feedback form URL is supplied.
- No real guest import files, passwords, service role keys or database credentials should be committed.

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required browser environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional server/admin variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD`

## Supabase Schema

Run the migrations in filename order:

1. `supabase/migrations/001_tcva_awards_live_schema.sql`
2. `supabase/migrations/002_editable_seating_and_guest_admin.sql`
3. `supabase/migrations/003_complete_realtime_publication.sql`
4. Continue with each later numbered migration in order, including
   `007_staff_account_activation.sql` for staff-account provisioning and access management, and
   `008_guest_creation.sql` for audited in-app guest creation.

Alternative developer route:

```bash
SUPABASE_DB_PASSWORD="your-database-password" npm run db:apply
```

The schema includes guest records, parties, event tables, check-in events, audit logging, QR assets, app settings, Row Level Security policies, summary views and realtime publication entries.

## Real Data Import

The import helper parses the final workbook and writes ignored outputs under `outputs/final-data`:

```bash
npm run data:prepare
```

The latest applied import created:

| Area | Count |
| --- | ---: |
| Event tables | 20 |
| Guest parties | 223 |
| Guests | 230 |
| Programme assets | 1 |
| Feedback links | 0 |
| Realtime publication tables | 5 |

The generated SQL import is intentionally ignored by git because it contains personal guest data.

## App Modes

Tablet Sign-In Mode:

- fast guest search
- large touch targets
- individual guest check-in
- linked party check-in
- undo check-in with required reason
- table, dietary, accessibility and note display
- live refresh from Supabase Realtime

Operations Mode:

- live dashboard
- category and table attendance summaries
- guest creation, search, editing and deletion
- seating/table reassignment
- CSV exports
- QR management for programme and feedback links
- latest audit activity

## Documentation

The final Version 2 PRD is in `docs/TCVA_Awards_2026_Version_2_PRD.md`.

## Deployment Notes

Deploy the Next.js app to Vercel and set the public Supabase URL and anon key in Vercel environment variables. Create the first app user and claim first admin access. Create later users in Supabase Authentication; the app administrator can then activate them and assign their role from **Operations → Staff access**. Public account creation is not offered by the production app.
