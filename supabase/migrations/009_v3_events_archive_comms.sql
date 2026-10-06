-- TCVA Live Check-In Version 3 event archive, communications and ongoing-use schema
-- Run after 008_guest_creation.sql.

begin;
 
do $$
begin
  create type public.event_status as enum ('draft', 'active', 'archived');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.events (
  id uuid primary key default extensions.gen_random_uuid(),
  event_key text not null unique,
  event_name text not null,
  event_year integer,
  event_date date,
  venue_name text,
  status public.event_status not null default 'draft',
  archived_at timestamptz,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

insert into public.events (
  event_key,
  event_name,
  event_year,
  event_date,
  venue_name,
  status,
  notes
)
values (
  'tcva-awards-2026',
  'TCVA Awards 2026',
  2026,
  '2026-10-02',
  'The Parkway Hotel, Cwmbran',
  'active',
  'Original Version 2 live awards event, now retained as the first event record for Version 3 archiving.'
)
on conflict (event_key) do nothing;

alter table public.event_tables
  add column if not exists event_id uuid references public.events(id) on delete cascade;

alter table public.guest_parties
  add column if not exists event_id uuid references public.events(id) on delete cascade;

alter table public.import_batches
  add column if not exists event_id uuid references public.events(id) on delete set null;

alter table public.guests
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists guest_type text not null default 'guest',
  add column if not exists award_result text,
  add column if not exists award_result_notes text,
  add column if not exists feedback_email_opt_in boolean not null default true,
  add column if not exists feedback_email_override boolean not null default false;

alter table public.attendance_events
  add column if not exists event_id uuid references public.events(id) on delete cascade;

alter table public.audit_log
  add column if not exists event_id uuid references public.events(id) on delete set null;

alter table public.event_assets
  add column if not exists event_id uuid references public.events(id) on delete cascade;

alter table public.feedback_links
  add column if not exists event_id uuid references public.events(id) on delete cascade;

do $$
begin
  alter table public.guests
    add constraint guests_award_result_check
    check (
      award_result is null
      or award_result in ('finalist', 'winner', 'runner_up', 'special_award', 'not_applicable')
    );
exception
  when duplicate_object then null;
end $$;

with current_event as (
  select id from public.events where event_key = 'tcva-awards-2026' limit 1
)
update public.event_tables
set event_id = (select id from current_event)
where event_id is null;

with current_event as (
  select id from public.events where event_key = 'tcva-awards-2026' limit 1
)
update public.guest_parties
set event_id = (select id from current_event)
where event_id is null;

with current_event as (
  select id from public.events where event_key = 'tcva-awards-2026' limit 1
)
update public.import_batches
set event_id = (select id from current_event)
where event_id is null;

with current_event as (
  select id from public.events where event_key = 'tcva-awards-2026' limit 1
)
update public.guests
set event_id = (select id from current_event)
where event_id is null;

update public.attendance_events as ae
set event_id = g.event_id
from public.guests as g
where ae.event_id is null
  and ae.guest_id = g.id;

with current_event as (
  select id from public.events where event_key = 'tcva-awards-2026' limit 1
)
update public.attendance_events
set event_id = (select id from current_event)
where event_id is null;

update public.audit_log as al
set event_id = g.event_id
from public.guests as g
where al.event_id is null
  and al.table_name = 'guests'
  and al.record_id = g.id;

with current_event as (
  select id from public.events where event_key = 'tcva-awards-2026' limit 1
)
update public.audit_log
set event_id = (select id from current_event)
where event_id is null;

with current_event as (
  select id from public.events where event_key = 'tcva-awards-2026' limit 1
)
update public.event_assets
set event_id = (select id from current_event)
where event_id is null;

with current_event as (
  select id from public.events where event_key = 'tcva-awards-2026' limit 1
)
update public.feedback_links
set event_id = (select id from current_event)
where event_id is null;

alter table public.event_tables
  alter column event_id set not null;

alter table public.guest_parties
  alter column event_id set not null;

alter table public.guests
  alter column event_id set not null;

alter table public.attendance_events
  alter column event_id set not null;

alter table public.event_assets
  alter column event_id set not null;

alter table public.feedback_links
  alter column event_id set not null;

alter table public.event_tables
  drop constraint if exists event_tables_table_number_key;

alter table public.guest_parties
  drop constraint if exists guest_parties_party_code_key;

alter table public.event_assets
  drop constraint if exists event_assets_asset_key_key;

alter table public.event_tables
  add constraint event_tables_event_id_table_number_key unique (event_id, table_number);

create unique index if not exists guest_parties_event_id_party_code_key
on public.guest_parties(event_id, party_code)
where party_code is not null;

alter table public.event_assets
  add constraint event_assets_event_id_asset_key_key unique (event_id, asset_key);

create index if not exists idx_events_status on public.events(status, event_date desc, created_at desc);
create index if not exists idx_event_tables_event_id on public.event_tables(event_id, display_order, table_number);
create index if not exists idx_guest_parties_event_id on public.guest_parties(event_id, party_name);
create index if not exists idx_import_batches_event_id on public.import_batches(event_id);
create index if not exists idx_guests_event_id on public.guests(event_id, full_name);
create index if not exists idx_guests_event_guest_type on public.guests(event_id, guest_type);
create index if not exists idx_attendance_events_event_id on public.attendance_events(event_id, created_at desc);
create index if not exists idx_audit_log_event_id on public.audit_log(event_id, created_at desc);
create index if not exists idx_event_assets_event_id on public.event_assets(event_id, display_order);
create index if not exists idx_feedback_links_event_id on public.feedback_links(event_id, display_order);

create table if not exists public.guest_types (
  id uuid primary key default extensions.gen_random_uuid(),
  value text not null unique,
  label text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_guest_types_updated_at on public.guest_types;
create trigger set_guest_types_updated_at
before update on public.guest_types
for each row execute function public.set_updated_at();

insert into public.guest_types (value, label, display_order)
values
  ('finalist', 'Finalist', 10),
  ('nominator', 'Nominator', 20),
  ('sponsor', 'Sponsor', 30),
  ('guest', 'Guest', 40),
  ('host', 'Host', 50),
  ('staff', 'Staff', 60),
  ('volunteer', 'Volunteer', 70),
  ('vip', 'VIP', 80),
  ('speaker', 'Speaker', 90),
  ('performer', 'Performer', 100),
  ('partner', 'Partner', 110),
  ('plus_one', 'Plus one', 120)
on conflict (value) do update
  set label = excluded.label,
      display_order = excluded.display_order,
      active = true,
      updated_at = now();

create table if not exists public.event_report_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  snapshot_name text not null,
  snapshot_type text not null default 'manual',
  metrics jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_report_snapshots_event_id
on public.event_report_snapshots(event_id, created_at desc);

create table if not exists public.event_communications (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  communication_type text not null default 'feedback',
  subject text not null default 'Thank you for attending',
  body text not null default 'Thank you for attending. Please use the links below to view the programme and complete the feedback form.',
  programme_url text,
  feedback_url text,
  include_programme boolean not null default true,
  include_feedback boolean not null default true,
  active boolean not null default true,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, communication_type)
);

drop trigger if exists set_event_communications_updated_at on public.event_communications;
create trigger set_event_communications_updated_at
before update on public.event_communications
for each row execute function public.set_updated_at();

create table if not exists public.event_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  communication_id uuid references public.event_communications(id) on delete cascade,
  label text not null,
  url text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_event_attachments_updated_at on public.event_attachments;
create trigger set_event_attachments_updated_at
before update on public.event_attachments
for each row execute function public.set_updated_at();

create table if not exists public.email_send_log (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  communication_id uuid references public.event_communications(id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  status text not null default 'queued',
  manual_override boolean not null default false,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  alter table public.email_send_log
    add constraint email_send_log_status_check
    check (status in ('queued', 'sent', 'failed', 'skipped'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_event_communications_event_id
on public.event_communications(event_id, communication_type);

create index if not exists idx_event_attachments_event_id
on public.event_attachments(event_id, display_order);

create index if not exists idx_email_send_log_event_id
on public.email_send_log(event_id, created_at desc);

with current_event as (
  select id from public.events where event_key = 'tcva-awards-2026' limit 1
),
programme as (
  select url from public.event_assets where asset_key = 'programme_pdf' limit 1
),
feedback as (
  select url from public.feedback_links where active = true limit 1
)
insert into public.event_communications (
  event_id,
  communication_type,
  subject,
  body,
  programme_url,
  feedback_url
)
select
  current_event.id,
  'feedback',
  'Thank you for attending the TCVA Awards',
  'Thank you for attending. Please use the links below to view the programme and complete the feedback form.',
  (select url from programme),
  (select url from feedback)
from current_event
on conflict (event_id, communication_type) do nothing;

create or replace function public.current_event_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.events e
  order by
    case e.status when 'active' then 0 when 'draft' then 1 else 2 end,
    e.event_date desc nulls last,
    e.created_at desc
  limit 1
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
      coalesce(new.guest_type, ''),
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

create or replace function public.upsert_event_table(
  p_table_number text,
  p_table_label text default null,
  p_capacity integer default null,
  p_table_type text default null,
  p_is_vip boolean default null,
  p_display_order integer default null,
  p_notes text default null,
  p_active boolean default true
)
returns public.event_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := public.current_event_id();
  v_table_number text := public.normalise_table_number(p_table_number);
  v_before public.event_tables;
  v_after public.event_tables;
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  perform public.require_event_manager();

  if v_event_id is null then
    raise exception 'No active event is available.';
  end if;

  if v_table_number is null then
    raise exception 'Table number is required.';
  end if;

  select *
  into v_before
  from public.event_tables
  where event_id = v_event_id
    and table_number = v_table_number
  for update;

  insert into public.event_tables (
    event_id,
    table_number,
    table_label,
    capacity,
    table_type,
    is_vip,
    display_order,
    notes,
    active
  )
  values (
    v_event_id,
    v_table_number,
    nullif(trim(coalesce(p_table_label, '')), ''),
    p_capacity,
    coalesce(nullif(trim(coalesce(p_table_type, '')), ''), 'standard'),
    coalesce(p_is_vip, false),
    coalesce(p_display_order, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_active, true)
  )
  on conflict (event_id, table_number) do update
    set table_label = excluded.table_label,
        capacity = excluded.capacity,
        table_type = excluded.table_type,
        is_vip = excluded.is_vip,
        display_order = excluded.display_order,
        notes = excluded.notes,
        active = excluded.active,
        updated_at = now()
  returning * into v_after;

  insert into public.audit_log (
    event_id,
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    performed_by_user_id,
    performed_by_email
  )
  values (
    v_event_id,
    'event_tables',
    v_after.id,
    case when v_before.id is null then 'create_table' else 'update_table' end,
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),
    v_user_id,
    lower(v_email)
  );

  return v_after;
end;
$$;

create or replace function public.assign_guest_table(
  p_guest_id uuid,
  p_table_number text default null,
  p_reason text default null,
  p_seat_sort_order integer default null,
  p_device_id text default null,
  p_device_label text default null
)
returns public.guests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_number text := public.normalise_table_number(p_table_number);
  v_table public.event_tables;
  v_before public.guests;
  v_after public.guests;
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_unassigned boolean := false;
begin
  perform public.require_event_manager();

  select *
  into v_before
  from public.guests
  where id = p_guest_id
  for update;

  if not found then
    raise exception 'Guest not found.';
  end if;

  if v_table_number is null or lower(v_table_number) in ('0', 'tbc', 'unassigned', 'none', 'n/a') then
    v_unassigned := true;
  else
    select *
    into v_table
    from public.event_tables
    where event_id = v_before.event_id
      and table_number = v_table_number
    for update;

    if not found then
      insert into public.event_tables (
        event_id,
        table_number,
        table_label,
        display_order,
        active
      )
      values (
        v_before.event_id,
        v_table_number,
        'Table ' || v_table_number,
        case when v_table_number ~ '^[0-9]+$' then v_table_number::integer else 0 end,
        true
      )
      returning * into v_table;
    end if;
  end if;

  update public.guests
  set table_id = case when v_unassigned then null else v_table.id end,
      seat_sort_order = p_seat_sort_order,
      seating_status = case when v_unassigned then 'unassigned' else 'assigned' end,
      last_action_at = now()
  where id = p_guest_id
  returning * into v_after;

  insert into public.audit_log (
    event_id,
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
    v_before.event_id,
    'guests',
    p_guest_id,
    'assign_table',
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

create or replace function public.update_guest_details(
  p_guest_id uuid,
  p_updates jsonb,
  p_reason text default null,
  p_device_id text default null,
  p_device_label text default null
)
returns public.guests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'invite_number',
    'first_name',
    'last_name',
    'full_name',
    'preferred_name',
    'organisation_name',
    'guest_type',
    'role_label',
    'relationship_label',
    'award_category',
    'sponsor_name',
    'award_result',
    'award_result_notes',
    'email',
    'phone',
    'dietary_notes',
    'accessibility_notes',
    'confirmation_status',
    'is_vip',
    'is_placeholder',
    'linked_notes',
    'admin_notes',
    'feedback_email_opt_in',
    'feedback_email_override',
    'seating_status',
    'seat_sort_order'
  ];
  v_bad_keys text[];
  v_before public.guests;
  v_after public.guests;
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  perform public.require_event_manager();

  if p_updates is null or jsonb_typeof(p_updates) <> 'object' then
    raise exception 'Updates must be a JSON object.';
  end if;

  select array_agg(key)
  into v_bad_keys
  from jsonb_object_keys(p_updates) as key
  where key <> all(v_allowed);

  if v_bad_keys is not null then
    raise exception 'Unsupported guest update field(s): %', array_to_string(v_bad_keys, ', ');
  end if;

  select *
  into v_before
  from public.guests
  where id = p_guest_id
  for update;

  if not found then
    raise exception 'Guest not found.';
  end if;

  update public.guests
  set invite_number = case when p_updates ? 'invite_number' then p_updates ->> 'invite_number' else invite_number end,
      first_name = case when p_updates ? 'first_name' then p_updates ->> 'first_name' else first_name end,
      last_name = case when p_updates ? 'last_name' then p_updates ->> 'last_name' else last_name end,
      full_name = case
        when p_updates ? 'full_name' then coalesce(nullif(p_updates ->> 'full_name', ''), full_name)
        else full_name
      end,
      preferred_name = case when p_updates ? 'preferred_name' then p_updates ->> 'preferred_name' else preferred_name end,
      organisation_name = case when p_updates ? 'organisation_name' then p_updates ->> 'organisation_name' else organisation_name end,
      guest_type = case when p_updates ? 'guest_type' then coalesce(nullif(p_updates ->> 'guest_type', ''), 'guest') else guest_type end,
      role_label = case when p_updates ? 'role_label' then p_updates ->> 'role_label' else role_label end,
      relationship_label = case when p_updates ? 'relationship_label' then p_updates ->> 'relationship_label' else relationship_label end,
      award_category = case when p_updates ? 'award_category' then p_updates ->> 'award_category' else award_category end,
      sponsor_name = case when p_updates ? 'sponsor_name' then p_updates ->> 'sponsor_name' else sponsor_name end,
      award_result = case when p_updates ? 'award_result' then nullif(p_updates ->> 'award_result', '') else award_result end,
      award_result_notes = case when p_updates ? 'award_result_notes' then p_updates ->> 'award_result_notes' else award_result_notes end,
      email = case when p_updates ? 'email' then p_updates ->> 'email' else email end,
      phone = case when p_updates ? 'phone' then p_updates ->> 'phone' else phone end,
      dietary_notes = case when p_updates ? 'dietary_notes' then p_updates ->> 'dietary_notes' else dietary_notes end,
      accessibility_notes = case when p_updates ? 'accessibility_notes' then p_updates ->> 'accessibility_notes' else accessibility_notes end,
      confirmation_status = case
        when p_updates ? 'confirmation_status' then (p_updates ->> 'confirmation_status')::public.guest_confirmation_status
        else confirmation_status
      end,
      is_vip = case when p_updates ? 'is_vip' then (p_updates ->> 'is_vip')::boolean else is_vip end,
      is_placeholder = case when p_updates ? 'is_placeholder' then (p_updates ->> 'is_placeholder')::boolean else is_placeholder end,
      linked_notes = case when p_updates ? 'linked_notes' then p_updates ->> 'linked_notes' else linked_notes end,
      admin_notes = case when p_updates ? 'admin_notes' then p_updates ->> 'admin_notes' else admin_notes end,
      feedback_email_opt_in = case when p_updates ? 'feedback_email_opt_in' then (p_updates ->> 'feedback_email_opt_in')::boolean else feedback_email_opt_in end,
      feedback_email_override = case when p_updates ? 'feedback_email_override' then (p_updates ->> 'feedback_email_override')::boolean else feedback_email_override end,
      seating_status = case when p_updates ? 'seating_status' then p_updates ->> 'seating_status' else seating_status end,
      seat_sort_order = case when p_updates ? 'seat_sort_order' then nullif(p_updates ->> 'seat_sort_order', '')::integer else seat_sort_order end,
      last_action_at = now()
  where id = p_guest_id
  returning * into v_after;

  insert into public.audit_log (
    event_id,
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
    v_before.event_id,
    'guests',
    p_guest_id,
    'update_guest_details',
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

create or replace function public.create_guest(
  p_guest jsonb,
  p_table_number text default null,
  p_party_id uuid default null,
  p_reason text default null,
  p_device_id text default null,
  p_device_label text default null
)
returns public.guests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := public.current_event_id();
  v_full_name text;
  v_table_number text := public.normalise_table_number(p_table_number);
  v_table public.event_tables;
  v_seating_status text;
  v_after public.guests;
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  perform public.require_event_manager();

  if v_event_id is null then
    raise exception 'No active event is available.';
  end if;

  if p_guest is null or jsonb_typeof(p_guest) <> 'object' then
    raise exception 'Guest details must be a JSON object.';
  end if;

  v_full_name := nullif(trim(coalesce(p_guest ->> 'full_name', '')), '');
  if v_full_name is null then
    raise exception 'Guest name is required.';
  end if;

  if p_party_id is not null then
    perform 1
    from public.guest_parties
    where id = p_party_id
      and event_id = v_event_id;

    if not found then
      raise exception 'Linked party not found for the active event.';
    end if;
  end if;

  if v_table_number is not null
     and lower(v_table_number) not in ('0', 'tbc', 'unassigned', 'none', 'n/a') then
    select *
    into v_table
    from public.event_tables
    where event_id = v_event_id
      and table_number = v_table_number
      and active = true;

    if not found then
      raise exception 'Selected table was not found for the active event.';
    end if;
  else
    v_table_number := null;
  end if;

  v_seating_status := case
    when v_table.id is not null then 'assigned'
    else coalesce(nullif(trim(coalesce(p_guest ->> 'seating_status', '')), ''), 'tbc')
  end;

  if v_seating_status not in ('assigned', 'unassigned', 'tbc', 'not_required') then
    raise exception 'Invalid seating status.';
  end if;

  if v_table.id is null and v_seating_status = 'assigned' then
    v_seating_status := 'tbc';
  end if;

  insert into public.guests (
    event_id,
    party_id,
    table_id,
    source_sheet,
    full_name,
    organisation_name,
    guest_type,
    role_label,
    relationship_label,
    award_category,
    award_result,
    award_result_notes,
    email,
    phone,
    dietary_notes,
    accessibility_notes,
    confirmation_status,
    attendance_status,
    seating_status,
    seat_sort_order,
    admin_notes,
    feedback_email_opt_in,
    feedback_email_override,
    last_action_at
  )
  values (
    v_event_id,
    p_party_id,
    v_table.id,
    'Added in app',
    v_full_name,
    nullif(trim(coalesce(p_guest ->> 'organisation_name', '')), ''),
    coalesce(nullif(trim(coalesce(p_guest ->> 'guest_type', '')), ''), 'guest'),
    nullif(trim(coalesce(p_guest ->> 'role_label', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'relationship_label', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'award_category', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'award_result', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'award_result_notes', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'email', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'phone', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'dietary_notes', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'accessibility_notes', '')), ''),
    coalesce(nullif(trim(coalesce(p_guest ->> 'confirmation_status', '')), ''), 'confirmed')::public.guest_confirmation_status,
    'not_arrived'::public.guest_attendance_status,
    v_seating_status,
    nullif(trim(coalesce(p_guest ->> 'seat_sort_order', '')), '')::integer,
    nullif(trim(coalesce(p_guest ->> 'admin_notes', '')), ''),
    coalesce((p_guest ->> 'feedback_email_opt_in')::boolean, true),
    coalesce((p_guest ->> 'feedback_email_override')::boolean, false),
    now()
  )
  returning * into v_after;

  insert into public.audit_log (
    event_id,
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
    v_event_id,
    'guests',
    v_after.id,
    'create_guest',
    null,
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
    event_id,
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
    v_before.event_id,
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
    event_id,
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
    v_before.event_id,
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

create or replace function public.delete_tbc_guests(
  p_reason text default null,
  p_device_id text default null,
  p_device_label text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := public.current_event_id();
  v_guest public.guests;
  v_deleted integer := 0;
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  perform public.require_event_manager();

  for v_guest in
    select *
    from public.guests
    where event_id = v_event_id
      and table_id is null
    order by full_name
    for update
  loop
    delete from public.guests
    where id = v_guest.id;

    insert into public.audit_log (
      event_id,
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
      v_guest.event_id,
      'guests',
      v_guest.id,
      'delete_tbc_guest',
      to_jsonb(v_guest),
      null,
      nullif(trim(coalesce(p_reason, '')), ''),
      nullif(trim(coalesce(p_device_id, '')), ''),
      nullif(trim(coalesce(p_device_label, '')), ''),
      v_user_id,
      lower(v_email)
    );

    v_deleted := v_deleted + 1;
  end loop;

  return v_deleted;
end;
$$;

create or replace view public.dashboard_attendance_summary
with (security_invoker = true)
as
select
  e.id as event_id,
  e.event_name,
  count(g.id) filter (where g.confirmation_status in ('confirmed', 'unconfirmed', 'tbc')) as total_expected,
  count(g.id) filter (where g.attendance_status = 'arrived') as total_arrived,
  count(g.id) filter (
    where g.confirmation_status in ('confirmed', 'unconfirmed', 'tbc')
      and g.attendance_status = 'not_arrived'
  ) as outstanding,
  count(g.id) filter (where g.attendance_status = 'not_attending') as total_not_attending,
  round(
    100.0 * count(g.id) filter (where g.attendance_status = 'arrived')
    / nullif(count(g.id) filter (where g.confirmation_status in ('confirmed', 'unconfirmed', 'tbc')), 0),
    1
  ) as attendance_percent
from public.events e
left join public.guests g on g.event_id = e.id
where e.status = 'active'
group by e.id, e.event_name;

create or replace view public.category_attendance_summary
with (security_invoker = true)
as
select
  e.id as event_id,
  coalesce(g.award_category, 'Uncategorised') as award_category,
  count(g.id) filter (where g.confirmation_status in ('confirmed', 'unconfirmed', 'tbc')) as expected,
  count(g.id) filter (where g.attendance_status = 'arrived') as arrived,
  count(g.id) filter (
    where g.confirmation_status in ('confirmed', 'unconfirmed', 'tbc')
      and g.attendance_status = 'not_arrived'
  ) as outstanding,
  round(
    100.0 * count(g.id) filter (where g.attendance_status = 'arrived')
    / nullif(count(g.id) filter (where g.confirmation_status in ('confirmed', 'unconfirmed', 'tbc')), 0),
    1
  ) as attendance_percent
from public.events e
left join public.guests g on g.event_id = e.id
where e.status = 'active'
group by e.id, coalesce(g.award_category, 'Uncategorised');

create or replace view public.table_attendance_summary
with (security_invoker = true)
as
select
  et.event_id,
  et.id as table_id,
  coalesce(et.table_number, 'TBC') as table_number,
  et.table_label,
  et.capacity,
  et.is_vip,
  count(g.id) filter (where g.confirmation_status in ('confirmed', 'unconfirmed', 'tbc')) as assigned,
  count(g.id) filter (where g.attendance_status = 'arrived') as arrived,
  count(g.id) filter (where nullif(g.dietary_notes, '') is not null) as dietary_flags,
  count(g.id) filter (where nullif(g.accessibility_notes, '') is not null) as accessibility_flags
from public.events e
join public.event_tables et on et.event_id = e.id
left join public.guests g on g.table_id = et.id and g.event_id = et.event_id
where e.status = 'active'
group by et.event_id, et.id, et.table_number, et.table_label, et.capacity, et.is_vip;

create or replace view public.seating_plan_export
with (security_invoker = true)
as
select
  e.event_name,
  g.id as guest_id,
  g.full_name,
  g.guest_type,
  g.role_label,
  g.relationship_label,
  g.organisation_name,
  g.award_category,
  g.award_result,
  g.award_result_notes,
  g.sponsor_name,
  coalesce(et.table_number, 'TBC') as table_number,
  et.table_label,
  g.seat_sort_order,
  g.seating_status,
  g.attendance_status,
  g.confirmation_status,
  g.dietary_notes,
  g.accessibility_notes,
  g.admin_notes,
  g.feedback_email_opt_in,
  g.feedback_email_override,
  gp.party_code,
  gp.party_name
from public.events e
join public.guests g on g.event_id = e.id
left join public.event_tables et on et.id = g.table_id and et.event_id = g.event_id
left join public.guest_parties gp on gp.id = g.party_id and gp.event_id = g.event_id
where e.status = 'active';

create or replace function public.create_event_report_snapshot(
  p_event_id uuid default null,
  p_snapshot_name text default null,
  p_snapshot_type text default 'manual'
)
returns public.event_report_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := coalesce(p_event_id, public.current_event_id());
  v_event public.events;
  v_snapshot public.event_report_snapshots;
  v_metrics jsonb;
begin
  perform public.require_event_manager();

  select * into v_event
  from public.events
  where id = v_event_id;

  if not found then
    raise exception 'Event not found.';
  end if;

  select jsonb_build_object(
    'event_name', v_event.event_name,
    'event_date', v_event.event_date,
    'venue_name', v_event.venue_name,
    'status', v_event.status,
    'created_at', now(),
    'attendance', (
      select jsonb_build_object(
        'total_expected', count(*) filter (where confirmation_status in ('confirmed', 'unconfirmed', 'tbc')),
        'total_arrived', count(*) filter (where attendance_status = 'arrived'),
        'outstanding', count(*) filter (
          where confirmation_status in ('confirmed', 'unconfirmed', 'tbc')
            and attendance_status = 'not_arrived'
        ),
        'total_not_attending', count(*) filter (where attendance_status = 'not_attending'),
        'attendance_percent', round(
          100.0 * count(*) filter (where attendance_status = 'arrived')
          / nullif(count(*) filter (where confirmation_status in ('confirmed', 'unconfirmed', 'tbc')), 0),
          1
        )
      )
      from public.guests
      where event_id = v_event_id
    ),
    'guest_types', coalesce((
      select jsonb_agg(row_to_json(t) order by t.guest_type)
      from (
        select coalesce(guest_type, 'guest') as guest_type, count(*) as guests
        from public.guests
        where event_id = v_event_id
        group by coalesce(guest_type, 'guest')
      ) as t
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(row_to_json(c) order by c.award_category)
      from (
        select
          coalesce(award_category, 'Uncategorised') as award_category,
          count(*) filter (where confirmation_status in ('confirmed', 'unconfirmed', 'tbc')) as expected,
          count(*) filter (where attendance_status = 'arrived') as arrived
        from public.guests
        where event_id = v_event_id
        group by coalesce(award_category, 'Uncategorised')
      ) as c
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(row_to_json(tb) order by tb.table_number)
      from (
        select
          et.table_number,
          et.table_label,
          et.capacity,
          count(g.id) as assigned,
          count(g.id) filter (where g.attendance_status = 'arrived') as arrived
        from public.event_tables et
        left join public.guests g on g.table_id = et.id and g.event_id = et.event_id
        where et.event_id = v_event_id
        group by et.table_number, et.table_label, et.capacity
      ) as tb
    ), '[]'::jsonb)
  )
  into v_metrics;

  insert into public.event_report_snapshots (
    event_id,
    snapshot_name,
    snapshot_type,
    metrics,
    created_by_user_id,
    created_by_email
  )
  values (
    v_event_id,
    coalesce(nullif(trim(p_snapshot_name), ''), v_event.event_name || ' report snapshot'),
    coalesce(nullif(trim(p_snapshot_type), ''), 'manual'),
    v_metrics,
    auth.uid(),
    lower(auth.jwt() ->> 'email')
  )
  returning * into v_snapshot;

  return v_snapshot;
end;
$$;

create or replace function public.archive_event(
  p_event_id uuid default null,
  p_snapshot_name text default null
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := coalesce(p_event_id, public.current_event_id());
  v_event public.events;
begin
  perform public.require_event_manager();

  perform public.create_event_report_snapshot(
    v_event_id,
    coalesce(nullif(trim(p_snapshot_name), ''), 'Archive snapshot'),
    'archive'
  );

  update public.events
  set status = 'archived',
      archived_at = now(),
      updated_at = now()
  where id = v_event_id
  returning * into v_event;

  if not found then
    raise exception 'Event not found.';
  end if;

  return v_event;
end;
$$;

create or replace function public.set_active_event(p_event_id uuid)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  perform public.require_event_manager();

  select * into v_event
  from public.events
  where id = p_event_id;

  if not found then
    raise exception 'Event not found.';
  end if;

  update public.events
  set status = case
        when id = p_event_id then 'active'::public.event_status
        when status = 'active' then 'archived'::public.event_status
        else status
      end,
      archived_at = case
        when id = p_event_id then null
        when status = 'active' then coalesce(archived_at, now())
        else archived_at
      end,
      updated_at = now()
  where id = p_event_id
     or status = 'active';

  select * into v_event
  from public.events
  where id = p_event_id;

  return v_event;
end;
$$;

create or replace function public.create_event_from_template(
  p_source_event_id uuid default null,
  p_event_name text default null,
  p_event_date date default null,
  p_venue_name text default null,
  p_notes text default null,
  p_activate boolean default false
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_event_id uuid := coalesce(p_source_event_id, public.current_event_id());
  v_source public.events;
  v_event public.events;
  v_key_base text;
begin
  perform public.require_event_manager();

  select * into v_source
  from public.events
  where id = v_source_event_id;

  if not found then
    raise exception 'Source event not found.';
  end if;

  if nullif(trim(coalesce(p_event_name, '')), '') is null then
    raise exception 'Event name is required.';
  end if;

  v_key_base := trim(both '-' from regexp_replace(lower(p_event_name), '[^a-z0-9]+', '-', 'g'));
  if v_key_base is null or v_key_base = '' then
    v_key_base := 'tcva-event';
  end if;

  insert into public.events (
    event_key,
    event_name,
    event_year,
    event_date,
    venue_name,
    status,
    notes,
    created_by_user_id
  )
  values (
    v_key_base || '-' || lower(left(extensions.gen_random_uuid()::text, 8)),
    trim(p_event_name),
    extract(year from p_event_date)::integer,
    p_event_date,
    nullif(trim(coalesce(p_venue_name, '')), ''),
    case when p_activate then 'active'::public.event_status else 'draft'::public.event_status end,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning * into v_event;

  insert into public.event_tables (
    event_id,
    table_number,
    table_label,
    capacity,
    table_type,
    is_vip,
    display_order,
    notes,
    source_table_key,
    seating_notes,
    active
  )
  select
    v_event.id,
    table_number,
    table_label,
    capacity,
    table_type,
    is_vip,
    display_order,
    notes,
    source_table_key,
    seating_notes,
    active
  from public.event_tables
  where event_id = v_source_event_id;

  insert into public.event_assets (
    event_id,
    asset_key,
    label,
    asset_type,
    url,
    qr_enabled,
    active,
    display_order,
    notes
  )
  select
    v_event.id,
    asset_key,
    label,
    asset_type,
    url,
    qr_enabled,
    active,
    display_order,
    notes
  from public.event_assets
  where event_id = v_source_event_id;

  insert into public.event_communications (
    event_id,
    communication_type,
    subject,
    body,
    programme_url,
    feedback_url,
    include_programme,
    include_feedback,
    active,
    updated_by_user_id
  )
  values (
    v_event.id,
    'feedback',
    'Thank you for attending ' || trim(p_event_name),
    'Thank you for attending. Please use the links below to view the programme and complete the feedback form.',
    null,
    null,
    true,
    true,
    true,
    auth.uid()
  )
  on conflict (event_id, communication_type) do nothing;

  if p_activate then
    perform public.set_active_event(v_event.id);
    select * into v_event from public.events where id = v_event.id;
  end if;

  return v_event;
end;
$$;

alter table public.events enable row level security;
alter table public.guest_types enable row level security;
alter table public.event_report_snapshots enable row level security;
alter table public.event_communications enable row level security;
alter table public.event_attachments enable row level security;
alter table public.email_send_log enable row level security;

drop policy if exists "Active staff can read events" on public.events;
create policy "Active staff can read events"
on public.events
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage events" on public.events;
create policy "Managers can manage events"
on public.events
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Active staff can read guest types" on public.guest_types;
create policy "Active staff can read guest types"
on public.guest_types
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage guest types" on public.guest_types;
create policy "Managers can manage guest types"
on public.guest_types
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Active staff can read report snapshots" on public.event_report_snapshots;
create policy "Active staff can read report snapshots"
on public.event_report_snapshots
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage report snapshots" on public.event_report_snapshots;
create policy "Managers can manage report snapshots"
on public.event_report_snapshots
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Active staff can read communications" on public.event_communications;
create policy "Active staff can read communications"
on public.event_communications
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage communications" on public.event_communications;
create policy "Managers can manage communications"
on public.event_communications
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Active staff can read attachments" on public.event_attachments;
create policy "Active staff can read attachments"
on public.event_attachments
for select
to authenticated
using (public.is_active_staff());

drop policy if exists "Managers can manage attachments" on public.event_attachments;
create policy "Managers can manage attachments"
on public.event_attachments
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

drop policy if exists "Managers can read email log" on public.email_send_log;
create policy "Managers can read email log"
on public.email_send_log
for select
to authenticated
using (public.is_event_manager());

drop policy if exists "Managers can manage email log" on public.email_send_log;
create policy "Managers can manage email log"
on public.email_send_log
for all
to authenticated
using (public.is_event_manager())
with check (public.is_event_manager());

grant select, insert, update, delete on
  public.events,
  public.guest_types,
  public.event_report_snapshots,
  public.event_communications,
  public.event_attachments,
  public.email_send_log
to authenticated;

grant execute on function public.current_event_id() to authenticated;
grant execute on function public.create_event_report_snapshot(uuid, text, text) to authenticated;
grant execute on function public.archive_event(uuid, text) to authenticated;
grant execute on function public.set_active_event(uuid) to authenticated;
grant execute on function public.create_event_from_template(uuid, text, date, text, text, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'guest_types'
  ) then
    alter publication supabase_realtime add table public.guest_types;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_report_snapshots'
  ) then
    alter publication supabase_realtime add table public.event_report_snapshots;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_communications'
  ) then
    alter publication supabase_realtime add table public.event_communications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_attachments'
  ) then
    alter publication supabase_realtime add table public.event_attachments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'email_send_log'
  ) then
    alter publication supabase_realtime add table public.email_send_log;
  end if;
exception
  when undefined_object then null;
end $$;

commit;
