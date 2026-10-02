-- TCVA Awards 2026 guest creation
-- Adds an audited event-manager-only function for creating guests in the app.

begin;

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
  v_full_name text;
  v_table_number text := public.normalise_table_number(p_table_number);
  v_table public.event_tables;
  v_seating_status text;
  v_after public.guests;
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  perform public.require_event_manager();

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
    where id = p_party_id;

    if not found then
      raise exception 'Linked party not found.';
    end if;
  end if;

  if v_table_number is not null
     and lower(v_table_number) not in ('0', 'tbc', 'unassigned', 'none', 'n/a') then
    select *
    into v_table
    from public.event_tables
    where table_number = v_table_number
      and active = true;

    if not found then
      raise exception 'Selected table was not found.';
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
    party_id,
    table_id,
    source_sheet,
    full_name,
    organisation_name,
    role_label,
    relationship_label,
    award_category,
    email,
    phone,
    dietary_notes,
    accessibility_notes,
    confirmation_status,
    attendance_status,
    seating_status,
    seat_sort_order,
    admin_notes,
    last_action_at
  )
  values (
    p_party_id,
    v_table.id,
    'Added in app',
    v_full_name,
    nullif(trim(coalesce(p_guest ->> 'organisation_name', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'role_label', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'relationship_label', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'award_category', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'email', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'phone', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'dietary_notes', '')), ''),
    nullif(trim(coalesce(p_guest ->> 'accessibility_notes', '')), ''),
    coalesce(nullif(trim(coalesce(p_guest ->> 'confirmation_status', '')), ''), 'confirmed')::public.guest_confirmation_status,
    'not_arrived'::public.guest_attendance_status,
    v_seating_status,
    nullif(trim(coalesce(p_guest ->> 'seat_sort_order', '')), '')::integer,
    nullif(trim(coalesce(p_guest ->> 'admin_notes', '')), ''),
    now()
  )
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

revoke all on function public.create_guest(jsonb, text, uuid, text, text, text) from public, anon;
grant execute on function public.create_guest(jsonb, text, uuid, text, text, text) to authenticated;

commit;
