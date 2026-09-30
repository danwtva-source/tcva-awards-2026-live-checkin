-- Provision and manage staff access for Supabase Auth users.
-- Existing Auth users are activated once when this migration is applied.
-- Future Auth users receive an inactive profile for an administrator to approve.

begin;

create or replace function public.provision_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.email, '')), '') is null then
    return new;
  end if;

  insert into public.staff_profiles (user_id, email, full_name, role, active)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(lower(new.email), '@', 1)
    ),
    'check_in',
    false
  )
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = coalesce(public.staff_profiles.full_name, excluded.full_name),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists provision_staff_profile_after_auth_user_insert on auth.users;
create trigger provision_staff_profile_after_auth_user_insert
after insert on auth.users
for each row execute function public.provision_staff_profile();

-- Link any manually prepared profile to its matching Auth account and activate it.
update public.staff_profiles as staff
set user_id = auth_user.id,
    full_name = coalesce(
      staff.full_name,
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
      split_part(lower(auth_user.email), '@', 1)
    ),
    active = true,
    updated_at = now()
from auth.users as auth_user
where lower(staff.email) = lower(auth_user.email)
  and (staff.user_id is null or staff.user_id = auth_user.id);

-- Create active event-manager profiles for Auth accounts that existed before this
-- migration. Existing roles (including the first admin) are preserved above.
insert into public.staff_profiles (user_id, email, full_name, role, active)
select
  auth_user.id,
  lower(auth_user.email),
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
    split_part(lower(auth_user.email), '@', 1)
  ),
  'event_manager',
  true
from auth.users as auth_user
where nullif(trim(coalesce(auth_user.email, '')), '') is not null
  and not exists (
    select 1
    from public.staff_profiles as staff
    where staff.user_id = auth_user.id
       or lower(staff.email) = lower(auth_user.email)
  );

create or replace function public.get_staff_activation_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'has_active_admin', exists (
      select 1 from public.staff_profiles where role = 'admin' and active = true
    ),
    'can_claim_first_admin', not exists (
      select 1 from public.staff_profiles where role = 'admin' and active = true
    ),
    'profile_exists', exists (
      select 1 from public.staff_profiles where user_id = auth.uid()
    ),
    'profile_active', exists (
      select 1 from public.staff_profiles where user_id = auth.uid() and active = true
    )
  )
$$;

create or replace function public.list_staff_accounts()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role public.staff_role,
  active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required to manage staff accounts.';
  end if;

  return query
  select
    auth_user.id,
    lower(auth_user.email),
    coalesce(
      staff.full_name,
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'name'), '')
    ),
    coalesce(staff.role, 'check_in'::public.staff_role),
    coalesce(staff.active, false),
    auth_user.created_at,
    auth_user.last_sign_in_at
  from auth.users as auth_user
  left join public.staff_profiles as staff on staff.user_id = auth_user.id
  where auth_user.email is not null
  order by lower(auth_user.email);
end;
$$;

create or replace function public.set_staff_account_access(
  p_user_id uuid,
  p_full_name text,
  p_role public.staff_role,
  p_active boolean
)
returns public.staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user auth.users%rowtype;
  v_before public.staff_profiles;
  v_profile public.staff_profiles;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required to manage staff accounts.';
  end if;

  select * into v_auth_user
  from auth.users
  where id = p_user_id;

  if not found or nullif(trim(coalesce(v_auth_user.email, '')), '') is null then
    raise exception 'The selected Supabase Auth user could not be found.';
  end if;

  if p_user_id = auth.uid() and (not coalesce(p_active, false) or p_role <> 'admin') then
    raise exception 'You cannot deactivate or remove administrator access from your own account.';
  end if;

  select * into v_before
  from public.staff_profiles
  where user_id = p_user_id;

  insert into public.staff_profiles (user_id, email, full_name, role, active)
  values (
    p_user_id,
    lower(v_auth_user.email),
    coalesce(nullif(trim(p_full_name), ''), split_part(lower(v_auth_user.email), '@', 1)),
    coalesce(p_role, 'check_in'::public.staff_role),
    coalesce(p_active, false)
  )
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        active = excluded.active,
        updated_at = now()
  returning * into v_profile;

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
    'staff_profiles',
    v_profile.id,
    'set_staff_account_access',
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_profile),
    auth.uid(),
    auth.jwt() ->> 'email'
  );

  return v_profile;
end;
$$;

revoke all on function public.provision_staff_profile() from public;
revoke all on function public.get_staff_activation_state() from public;
revoke all on function public.list_staff_accounts() from public;
revoke all on function public.set_staff_account_access(uuid, text, public.staff_role, boolean) from public;

grant execute on function public.get_staff_activation_state() to authenticated;
grant execute on function public.list_staff_accounts() to authenticated;
grant execute on function public.set_staff_account_access(uuid, text, public.staff_role, boolean) to authenticated;

commit;
