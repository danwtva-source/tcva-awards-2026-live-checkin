-- TCVA Awards 2026 guest deletion admin actions
-- Adds audited manager-only guest deletion, including a guarded bulk clear for
-- the TBC/unassigned seating group.

begin;

create or replace function public.delete_guest(
  p_guest_id uuid,
  p_reason text default null,
  p_device_id text default null,
  p_device_label text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.guests;
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
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

  delete from public.guests
  where id = p_guest_id;

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
    'delete_guest',
    to_jsonb(v_before),
    null,
    nullif(trim(coalesce(p_reason, '')), ''),
    nullif(trim(coalesce(p_device_id, '')), ''),
    nullif(trim(coalesce(p_device_label, '')), ''),
    v_user_id,
    lower(v_email)
  );
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
  v_guest public.guests;
  v_deleted integer := 0;
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  perform public.require_event_manager();

  for v_guest in
    select *
    from public.guests
    where table_id is null
    order by full_name
    for update
  loop
    delete from public.guests
    where id = v_guest.id;

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

grant execute on function public.delete_guest(uuid, text, text, text) to authenticated;
grant execute on function public.delete_tbc_guests(text, text, text) to authenticated;

commit;
