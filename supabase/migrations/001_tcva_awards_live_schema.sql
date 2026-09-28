-- TCVA Awards 2026 live check-in schema
-- Target: Supabase Postgres
-- Purpose: Version 2 connected app with tablet sign-in mode and laptop operations mode.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

do $$
begin
  create type public.staff_role as enum ('check_in', 'event_manager', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.guest_attendance_status as enum ('not_arrived', 'arrived', 'not_attending', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.guest_confirmation_status as enum ('confirmed', 'unconfirmed', 'declined', 'waitlist', 'tbc');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.attendance_action as enum (
    'check_in',
    'party_check_in',
    'undo_check_in',
    'mark_not_attending',
    'reset_to_expected',
    'note'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.staff_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.staff_role not null default 'check_in',
  active boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_tables (
  id uuid primary key default extensions.gen_random_uuid(),
  table_number text not null unique,
  table_label text,
  capacity integer check (capacity is null or capacity >= 0),
  table_type text not null default 'standard',
  is_vip boolean not null default false,
  display_order integer not null default 0,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guest_parties (
  id uuid primary key default extensions.gen_random_uuid(),
  party_code text unique,
  party_name text,
  lead_guest_name text,
  organisation_name text,
  award_category text,
  sponsor_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  source_file_name text,
  source_file_hash text,
  imported_by_user_id uuid references auth.users(id) on delete set null,
  rows_seen integer not null default 0,
  rows_imported integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.guests (
  id uuid primary key default extensions.gen_random_uuid(),
  party_id uuid references public.guest_parties(id) on delete set null,
  table_id uuid references public.event_tables(id) on delete set null,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  invite_number text,
  source_sheet text,
  source_row_number integer,
  first_name text,
  last_name text,
  full_name text not null,
  preferred_name text,
  organisation_name text,
  role_label text,
  relationship_label text,
  award_category text,
  sponsor_name text,
  email text,
  phone text,
  dietary_notes text,
  accessibility_notes text,
  attendance_status public.guest_attendance_status not null default 'not_arrived',
  confirmation_status public.guest_confirmation_status not null default 'tbc',
  is_vip boolean not null default false,
  is_placeholder boolean not null default false,
  plus_one_of_guest_id uuid references public.guests(id) on delete set null deferrable initially deferred,
  nominator_of_guest_id uuid references public.guests(id) on delete set null deferrable initially deferred,
  linked_notes text,
  check_in_time timestamptz,
  checked_in_by_user_id uuid references auth.users(id) on delete set null,
  last_action_at timestamptz,
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_events (
  id uuid primary key default extensions.gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  party_id uuid references public.guest_parties(id) on delete set null,
  action public.attendance_action not null,
  previous_status public.guest_attendance_status,
  new_status public.guest_attendance_status,
  reason text,
  device_id text,
  device_label text,
  performed_by_user_id uuid references auth.users(id) on delete set null,
  performed_by_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  device_id text,
  device_label text,
  performed_by_user_id uuid references auth.users(id) on delete set null,
  performed_by_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  asset_key text not null unique,
  label text not null,
  asset_type text not null default 'other',
  url text not null,
  qr_enabled boolean not null default true,
  active boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_links (
  id uuid primary key default extensions.gen_random_uuid(),
  label text not null default 'Feedback form',
  url text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  opens_at timestamptz,
  closes_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_guest_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text = lower(
    concat_ws(
      ' ',
      coalesce(new.invite_number, ''),
      coalesce(new.first_name, ''),
      coalesce(new.last_name, ''),
      coalesce(new.full_name, ''),
      coalesce(new.preferred_name, ''),
      coalesce(new.organisation_name, ''),
      coalesce(new.role_label, ''),
      coalesce(new.relationship_label, ''),
      coalesce(new.award_category, ''),
      coalesce(new.sponsor_name, ''),
      coalesce(new.email, ''),
      coalesce(new.phone, ''),
      coalesce(new.dietary_notes, ''),
      coalesce(new.accessibility_notes, ''),
      coalesce(new.linked_notes, '')
    )
  );

  return new;
end;
$$;

drop trigger if exists set_staff_profiles_updated_at on public.staff_profiles;
create trigger set_staff_profiles_updated_at
before update on public.staff_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_event_tables_updated_at on public.event_tables;
create trigger set_event_tables_updated_at
before update on public.event_tables
for each row execute function public.set_updated_at();

drop trigger if exists set_guest_parties_updated_at on public.guest_parties;
create trigger set_guest_parties_updated_at
before update on public.guest_parties
for each row execute function public.set_updated_at();

drop trigger if exists set_guests_updated_at on public.guests;
create trigger set_guests_updated_at
before update on public.guests
for each row execute function public.set_updated_at();

drop trigger if exists set_guests_search_text on public.guests;
create trigger set_guests_search_text
before insert or update on public.guests
for each row execute function public.set_guest_search_text();

drop trigger if exists set_event_assets_updated_at on public.event_assets;
create trigger set_event_assets_updated_at
before update on public.event_assets
for each row execute function public.set_updated_at();

drop trigger if exists set_feedback_links_updated_at on public.feedback_links;
create trigger set_feedback_links_updated_at
before update on public.feedback_links
for each row execute function public.set_updated_at();

create index if not exists idx_staff_profiles_user_id on public.staff_profiles(user_id);
create index if not exists idx_staff_profiles_email on public.staff_profiles(lower(email));
create index if not exists idx_event_tables_number on public.event_tables(table_number);
create index if not exists idx_guest_parties_code on public.guest_parties(party_code);
create index if not exists idx_guests_party_id on public.guests(party_id);
create index if not exists idx_guests_table_id on public.guests(table_id);
create index if not exists idx_guests_attendance_status on public.guests(attendance_status);
create index if not exists idx_guests_confirmation_status on public.guests(confirmation_status);
create index if not exists idx_guests_full_name on public.guests(lower(full_name));
create index if not exists idx_guests_search_text_trgm on public.guests using gin (search_text gin_trgm_ops);
create index if not exists idx_attendance_events_guest_created on public.attendance_events(guest_id, created_at desc);
create index if not exists idx_attendance_events_party_created on public.attendance_events(party_id, created_at desc);
create index if not exists idx_audit_log_record on public.audit_log(table_name, record_id, created_at desc);

create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select sp.role::text
  from public.staff_profiles sp
  where sp.user_id = auth.uid()
    and sp.active = true
  limit 1
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = auth.uid()
      and sp.active = true
  )
$$;

create or replace function public.is_event_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role(), '') in ('event_manager', 'admin')
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role(), '') = 'admin'
$$;

create or replace function public.claim_first_admin(p_full_name text default null)
returns public.staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_profile public.staff_profiles;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to claim the first admin account.';
  end if;

  if exists (
    select 1
    from public.staff_profiles
    where role = 'admin'
      and active = true
  ) then
    raise exception 'An active admin account already exists.';
  end if;

  if nullif(trim(coalesce(v_email, '')), '') is null then
    raise exception 'Your signed-in account does not expose an email address.';
  end if;

  insert into public.staff_profiles (user_id, email, full_name, role, active)
  values (v_user_id, lower(v_email), nullif(trim(p_full_name), ''), 'admin', true)
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.staff_profiles.full_name),
        role = 'admin',
        active = true,
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.record_attendance_action(
  p_guest_id uuid,
  p_action public.attendance_action,
  p_reason text default null,
  p_device_id text default null,
  p_device_label text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.guests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_role text;
  v_before public.guests;
  v_after public.guests;
  v_new_status public.guest_attendance_status;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to record attendance.';
  end if;

  select public.current_staff_role() into v_role;

  if v_role is null then
    raise exception 'Your account is not active for this event.';
  end if;

  select *
  into v_before
  from public.guests
  where id = p_guest_id
  for update;

  if not found then
    raise exception 'Guest not found.';
  end if;

  if p_action in ('check_in', 'party_check_in') then
    v_new_status := 'arrived';
  elsif p_action = 'undo_check_in' then
    if nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'Undo check-in requires a reason.';
    end if;
    v_new_status := 'not_arrived';
  elsif p_action = 'mark_not_attending' then
    v_new_status := 'not_attending';
  elsif p_action = 'reset_to_expected' then
    v_new_status := 'not_arrived';
  elsif p_action = 'note' then
    v_new_status := v_before.attendance_status;
  else
    raise exception 'Unsupported attendance action.';
  end if;

  update public.guests
  set attendance_status = v_new_status,
      check_in_time = case
        when v_new_status = 'arrived' then coalesce(v_before.check_in_time, now())
        else null
      end,
      checked_in_by_user_id = case
        when v_new_status = 'arrived' then v_user_id
        else null
      end,
      last_action_at = now()
  where id = p_guest_id
  returning * into v_after;

  insert into public.attendance_events (
    guest_id,
    party_id,
    action,
    previous_status,
    new_status,
    reason,
    device_id,
    device_label,
    performed_by_user_id,
    performed_by_email,
    metadata
  )
  values (
    p_guest_id,
    v_before.party_id,
    p_action,
    v_before.attendance_status,
    v_new_status,
    nullif(trim(coalesce(p_reason, '')), ''),
    nullif(trim(coalesce(p_device_id, '')), ''),
    nullif(trim(coalesce(p_device_label, '')), ''),
    v_user_id,
    lower(v_email),
    coalesce(p_metadata, '{}'::jsonb)
  );

  insert into public.audit_log (
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    reason,
    device_id,
    device_label,
    performed_by_user_id,
    performed_by_email
  )
  values (
    'guests',
    p_guest_id,
    p_action::text,
    to_jsonb(v_before),
    to_jsonb(v_after),
    nullif(trim(coalesce(p_reason, '')), ''),
    nullif(trim(coalesce(p_device_id, '')), ''),
    nullif(trim(coalesce(p_device_label, '')), ''),
    v_user_id,
    lower(v_email)
  );

  return v_after;
end;
$$;

create or replace function public.record_party_attendance_action(
  p_party_id uuid,
  p_action public.attendance_action,
  p_guest_ids uuid[] default null,
  p_reason text default null,
  p_device_id text default null,
  p_device_label text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns setof public.guests
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select (public.record_attendance_action(g.id, p_action, p_reason, p_device_id, p_device_label, p_metadata)).*
  from public.guests g
  where g.party_id = p_party_id
    and (p_guest_ids is null or g.id = any(p_guest_ids))
  order by g.full_name;
end;
$$;

create or replace view public.dashboard_attendance_summary
with (security_invoker = true)
as
select
  count(*) filter (where confirmation_status in ('confirmed', 'unconfirmed', 'tbc')) as total_expected,
  count(*) filter (where attendance_status = 'arrived') as total_arrived,
  count(*) filter (
    where confirmation_status in ('confirmed', 'unconfirmed', 'tbc')
      and attendance_status = 'not_arrived'
  ) as outstanding,
  count(*) filter (where attendance_status = 'not_attending') as total_not_attending,
  round(
    100.0 * count(*) filter (where attendance_status = 'arrived')
    / nullif(count(*) filter (where confirmation_status in ('confirmed', 'unconfirmed', 'tbc')), 0),
    1
  ) as attendance_percent
from public.guests;

create or replace view public.category_attendance_summary
with (security_invoker = true)
as
select
  coalesce(award_category, 'Uncategorised') as award_category,
  count(*) filter (where confirmation_status in ('confirmed', 'unconfirmed', 'tbc')) as expected,
  count(*) filter (where attendance_status = 'arrived') as arrived,
  count(*) filter (
    where confirmation_status in ('confirmed', 'unconfirmed', 'tbc')
      and attendance_status = 'not_arrived'
  ) as outstanding,
  round(
    100.0 * count(*) filter (where attendance_status = 'arrived')
    / nullif(count(*) filter (where confirmation_status in ('confirmed', 'unconfirmed', 'tbc')), 0),
    1
  ) as attendance_percent
from public.guests
group by coalesce(award_category, 'Uncategorised');

create or replace view public.table_attendance_summary
with (security_invoker = true)
as
select
  et.id as table_id,
  coalesce(et.table_number, 'TBC') as table_number,
  et.table_label,
  et.capacity,
  et.is_vip,
  count(g.id) filter (where g.confirmation_status in ('confirmed', 'unconfirmed', 'tbc')) as assigned,
  count(g.id) filter (where g.attendance_status = 'arrived') as arrived,
  count(g.id) filter (where nullif(g.dietary_notes, '') is not null) as dietary_flags,
  count(g.id) filter (where nullif(g.accessibility_notes, '') is not null) as accessibility_flags
from public.event_tables et
left join public.guests g on g.table_id = et.id
group by et.id, et.table_number, et.table_label, et.capacity, et.is_vip;

alter table public.staff_profiles enable row level security;
alter table public.event_tables enable row level security;
alter table public.guest_parties enable row level security;
alter table public.import_batches enable row level security;
alter table public.guests enable row level security;
alter table public.attendance_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.event_assets enable row level security;
alter table public.feedback_links enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "Staff can read own profile and managers can read all" on public.staff_profiles;
create policy "Staff can read own profile and managers can read all"
on public.staff_profiles
for select
to authenticated
using (user_id = auth.uid() or public.is_event_manager());

drop policy if exists "Admins can manage staff profiles" on public.staff_profiles;
create policy "Admins can manage staff profiles"
on public.staff_profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Active staff can read event tables" on public.event_tables;
create policy "Active staff can read event tables"
on public.event_tables
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage event tables" on public.event_tables;
create policy "Managers can manage event tables"
on public.event_tables
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Active staff can read guest parties" on public.guest_parties;
create policy "Active staff can read guest parties"
on public.guest_parties
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage guest parties" on public.guest_parties;
create policy "Managers can manage guest parties"
on public.guest_parties
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Managers can read import batches" on public.import_batches;
create policy "Managers can read import batches"
on public.import_batches
for select
to authenticated
using (public.is_event_manager());

drop policy if exists "Managers can manage import batches" on public.import_batches;
create policy "Managers can manage import batches"
on public.import_batches
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Active staff can read guests" on public.guests;
create policy "Active staff can read guests"
on public.guests
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage guests" on public.guests;
create policy "Managers can manage guests"
on public.guests
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Active staff can read attendance events" on public.attendance_events;
create policy "Active staff can read attendance events"
on public.attendance_events
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage attendance events" on public.attendance_events;
create policy "Managers can manage attendance events"
on public.attendance_events
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Managers can read audit log" on public.audit_log;
create policy "Managers can read audit log"
on public.audit_log
for select
to authenticated
using (public.is_event_manager());

drop policy if exists "Admins can manage audit log" on public.audit_log;
create policy "Admins can manage audit log"
on public.audit_log
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Active staff can read event assets" on public.event_assets;
create policy "Active staff can read event assets"
on public.event_assets
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage event assets" on public.event_assets;
create policy "Managers can manage event assets"
on public.event_assets
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Active staff can read feedback links" on public.feedback_links;
create policy "Active staff can read feedback links"
on public.feedback_links
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage feedback links" on public.feedback_links;
create policy "Managers can manage feedback links"
on public.feedback_links
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Active staff can read app settings" on public.app_settings;
create policy "Active staff can read app settings"
on public.app_settings
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage app settings" on public.app_settings;
create policy "Managers can manage app settings"
on public.app_settings
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.staff_profiles,
  public.event_tables,
  public.guest_parties,
  public.import_batches,
  public.guests,
  public.attendance_events,
  public.audit_log,
  public.event_assets,
  public.feedback_links,
  public.app_settings
to authenticated;

grant select on
  public.dashboard_attendance_summary,
  public.category_attendance_summary,
  public.table_attendance_summary
to authenticated;

grant execute on function public.claim_first_admin(text) to authenticated;
grant execute on function public.record_attendance_action(uuid, public.attendance_action, text, text, text, jsonb) to authenticated;
grant execute on function public.record_party_attendance_action(uuid, public.attendance_action, uuid[], text, text, text, jsonb) to authenticated;

insert into public.app_settings (key, value)
values
  ('event_name', '"TCVA Awards 2026"'::jsonb),
  ('default_interface_mode', '"sign_in"'::jsonb),
  ('programme_qr_enabled', 'true'::jsonb),
  ('feedback_qr_enabled', 'true'::jsonb)
on conflict (key) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'guests'
  ) then
    alter publication supabase_realtime add table public.guests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance_events'
  ) then
    alter publication supabase_realtime add table public.attendance_events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_tables'
  ) then
    alter publication supabase_realtime add table public.event_tables;
  end if;
exception
  when undefined_object then null;
end $$;

commit;
