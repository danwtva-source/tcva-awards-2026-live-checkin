-- TCVA Awards 2026 editable seating and guest administration
-- Run after 001_tcva_awards_live_schema.sql.

begin;

alter table public.event_tables
  add column if not exists source_table_key text,
  add column if not exists seating_notes text;

alter table public.guests
  add column if not exists seat_sort_order integer,
  add column if not exists seating_status text not null default 'unassigned',
  add column if not exists admin_notes text;

do $$
begin
  alter table public.guests
    add constraint guests_seating_status_check
    check (seating_status in ('assigned', 'unassigned', 'tbc', 'not_required'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_guests_seating_status on public.guests(seating_status);
create index if not exists idx_guests_table_sort on public.guests(table_id, seat_sort_order, full_name);
create index if not exists idx_event_tables_display on public.event_tables(display_order, table_number);

update public.guests
set seating_status = 'assigned'
where table_id is not null
  and seating_status = 'unassigned';

update public.event_tables
set display_order = table_number::integer
where table_number ~ '^[0-9]+$'
  and display_order = 0;

create or replace function public.require_event_manager()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.is_event_manager() then
    raise exception 'You need event manager access for this action.';
  end if;
end;
$$;

create or replace function public.normalise_table_number(p_table_number text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(trim(coalesce(p_table_number, '')), '^table\\s*', '', 'i'),
      '\\s+',
      ' ',
      'g'
    ),
    ''
  )
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
  v_table_number text := public.normalise_table_number(p_table_number);
  v_before public.event_tables;
  v_after public.event_tables;
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  perform public.require_event_manager();

  if v_table_number is null then
    raise exception 'Table number is required.';
  end if;

  select *
  into v_before
  from public.event_tables
  where table_number = v_table_number
  for update;

  insert into public.event_tables (
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
    v_table_number,
    nullif(trim(coalesce(p_table_label, '')), ''),
    p_capacity,
    coalesce(nullif(trim(coalesce(p_table_type, '')), ''), 'standard'),
    coalesce(p_is_vip, false),
    coalesce(p_display_order, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_active, true)
  )
  on conflict (table_number) do update
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
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    performed_by_user_id,
    performed_by_email
  )
  values (
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
    where table_number = v_table_number
    for update;

    if not found then
      insert into public.event_tables (
        table_number,
        table_label,
        display_order,
        active
      )
      values (
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

create or replace function public.assign_party_table(
  p_party_id uuid,
  p_table_number text default null,
  p_reason text default null,
  p_device_id text default null,
  p_device_label text default null
)
returns setof public.guests
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_event_manager();

  return query
  select (public.assign_guest_table(
    g.id,
    p_table_number,
    p_reason,
    null,
    p_device_id,
    p_device_label
  )).*
  from public.guests g
  where g.party_id = p_party_id
  order by g.full_name;
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
    'role_label',
    'relationship_label',
    'award_category',
    'sponsor_name',
    'email',
    'phone',
    'dietary_notes',
    'accessibility_notes',
    'confirmation_status',
    'is_vip',
    'is_placeholder',
    'linked_notes',
    'admin_notes',
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
      role_label = case when p_updates ? 'role_label' then p_updates ->> 'role_label' else role_label end,
      relationship_label = case when p_updates ? 'relationship_label' then p_updates ->> 'relationship_label' else relationship_label end,
      award_category = case when p_updates ? 'award_category' then p_updates ->> 'award_category' else award_category end,
      sponsor_name = case when p_updates ? 'sponsor_name' then p_updates ->> 'sponsor_name' else sponsor_name end,
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
      seating_status = case when p_updates ? 'seating_status' then p_updates ->> 'seating_status' else seating_status end,
      seat_sort_order = case when p_updates ? 'seat_sort_order' then nullif(p_updates ->> 'seat_sort_order', '')::integer else seat_sort_order end,
      last_action_at = now()
  where id = p_guest_id
  returning * into v_after;

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

create or replace view public.seating_plan_export
with (security_invoker = true)
as
select
  g.id as guest_id,
  g.full_name,
  g.role_label,
  g.relationship_label,
  g.organisation_name,
  g.award_category,
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
  gp.party_code,
  gp.party_name
from public.guests g
left join public.event_tables et on et.id = g.table_id
left join public.guest_parties gp on gp.id = g.party_id;

grant select on public.seating_plan_export to authenticated;
grant execute on function public.upsert_event_table(text, text, integer, text, boolean, integer, text, boolean) to authenticated;
grant execute on function public.assign_guest_table(uuid, text, text, integer, text, text) to authenticated;
grant execute on function public.assign_party_table(uuid, text, text, text, text) to authenticated;
grant execute on function public.update_guest_details(uuid, jsonb, text, text, text) to authenticated;

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
      and tablename = 'event_tables'
  ) then
    alter publication supabase_realtime add table public.event_tables;
  end if;
exception
  when undefined_object then null;
end $$;

commit;
