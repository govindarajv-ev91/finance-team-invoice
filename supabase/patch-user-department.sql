-- One user = one department
-- Run in Supabase SQL Editor

alter table public.profiles
  add column if not exists department_id uuid references public.departments(id);

-- Allow signup page (not logged in) to load department list
drop policy if exists "Anyone authenticated can read departments" on public.departments;
drop policy if exists "Public can read departments" on public.departments;

create policy "Anyone can read departments"
  on public.departments for select
  using (true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
  v_approved boolean;
  v_dept uuid;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'user');
  if v_role not in ('user', 'finance', 'admin', 'ceo') then
    v_role := 'user';
  end if;
  v_approved := v_role <> 'user';

  begin
    v_dept := nullif(new.raw_user_meta_data->>'department_id', '')::uuid;
  exception when others then
    v_dept := null;
  end;

  insert into public.profiles (id, email, full_name, role, is_approved, approved_at, department_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role,
    v_approved,
    case when v_approved then now() else null end,
    v_dept
  );
  return new;
end;
$$;
