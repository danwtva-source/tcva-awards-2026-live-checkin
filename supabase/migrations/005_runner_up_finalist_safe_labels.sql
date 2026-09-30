-- TCVA Awards 2026 runner-up finalist-safe labels
-- Ensures any runner-up status is hidden from guest-facing app views/exports.

begin;

create or replace function pg_temp.finalist_safe_label(value text)
returns text
language sql
immutable
as $$
  with combined_labels as (
    select regexp_replace(coalesce(value, ''), 'winners?,?\s*runner\s*ups?\s*(&|and)\s*nominees?', 'Finalists', 'gi') as label
  ),
  runners_plural as (
    select regexp_replace(label, 'runners[[:space:]-]+ups?', 'Finalists', 'gi') as label from combined_labels
  ),
  runner_ups_plural as (
    select regexp_replace(label, 'runner[[:space:]-]+ups', 'Finalists', 'gi') as label from runners_plural
  ),
  runner_up_singular as (
    select regexp_replace(label, 'runner[[:space:]-]+up', 'Finalist', 'gi') as label from runner_ups_plural
  ),
  winners as (
    select regexp_replace(label, 'winners?', 'Finalists', 'gi') as label from runner_up_singular
  ),
  finalists as (
    select regexp_replace(label, 'finalists?', 'Finalists', 'gi') as label from winners
  )
  select nullif(label, '') from finalists
$$;

update public.guests
set source_sheet = case
      when coalesce(source_sheet, '') ~* '(winner|runner[[:space:]-]+up|runners[[:space:]-]+up)' then 'Finalists'
      else pg_temp.finalist_safe_label(source_sheet)
    end,
    role_label = pg_temp.finalist_safe_label(role_label),
    relationship_label = pg_temp.finalist_safe_label(relationship_label),
    award_category = pg_temp.finalist_safe_label(award_category),
    sponsor_name = pg_temp.finalist_safe_label(sponsor_name),
    linked_notes = pg_temp.finalist_safe_label(linked_notes),
    admin_notes = pg_temp.finalist_safe_label(admin_notes)
where concat_ws(' ', source_sheet, role_label, relationship_label, award_category, sponsor_name, linked_notes, admin_notes) ~* '(winner|runner[[:space:]-]+up|runners[[:space:]-]+up)';

update public.guest_parties
set party_code = case
      when coalesce(party_code, '') ~* '^winners' then regexp_replace(party_code, '^winners', 'finalists', 'i')
      when coalesce(party_code, '') ~* '^runner[[:space:]-]+up' then regexp_replace(party_code, '^runner[[:space:]-]+ups?', 'finalists', 'i')
      when coalesce(party_code, '') ~* '^runners[[:space:]-]+up' then regexp_replace(party_code, '^runners[[:space:]-]+ups?', 'finalists', 'i')
      else pg_temp.finalist_safe_label(party_code)
    end,
    party_name = pg_temp.finalist_safe_label(party_name),
    award_category = pg_temp.finalist_safe_label(award_category),
    sponsor_name = pg_temp.finalist_safe_label(sponsor_name),
    notes = pg_temp.finalist_safe_label(notes)
where concat_ws(' ', party_code, party_name, award_category, sponsor_name, notes) ~* '(winner|runner[[:space:]-]+up|runners[[:space:]-]+up)';

commit;
