-- TCVA Awards 2026 finalist-safe labels
-- Normalises winner-related import labels so nominees and guests only see
-- finalist-safe wording in the app and exports.

begin;

create or replace function pg_temp.finalist_safe_label(value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(value, ''), 'winners?,?\s*runner\s*ups?\s*(&|and)\s*nominees?', 'Finalists', 'gi'),
        'winners?',
        'Finalists',
        'gi'
      ),
      'finalists?',
      'Finalists',
      'gi'
    ),
    ''
  )
$$;

update public.guests
set source_sheet = case
      when coalesce(source_sheet, '') ~* 'winner' then 'Finalists'
      else pg_temp.finalist_safe_label(source_sheet)
    end,
    role_label = pg_temp.finalist_safe_label(role_label),
    relationship_label = pg_temp.finalist_safe_label(relationship_label),
    award_category = pg_temp.finalist_safe_label(award_category),
    sponsor_name = pg_temp.finalist_safe_label(sponsor_name),
    linked_notes = pg_temp.finalist_safe_label(linked_notes),
    admin_notes = pg_temp.finalist_safe_label(admin_notes)
where concat_ws(' ', source_sheet, role_label, relationship_label, award_category, sponsor_name, linked_notes, admin_notes) ~* 'winner';

update public.guest_parties
set party_code = case
      when coalesce(party_code, '') ~* '^winners' then regexp_replace(party_code, '^winners', 'finalists', 'i')
      else pg_temp.finalist_safe_label(party_code)
    end,
    party_name = pg_temp.finalist_safe_label(party_name),
    award_category = pg_temp.finalist_safe_label(award_category),
    sponsor_name = pg_temp.finalist_safe_label(sponsor_name),
    notes = pg_temp.finalist_safe_label(notes)
where concat_ws(' ', party_code, party_name, award_category, sponsor_name, notes) ~* 'winner';

commit;
