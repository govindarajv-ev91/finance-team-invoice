-- Department-level Team Head -> CEO approval routing
-- Run once in Supabase SQL Editor, then reload the app.

alter table public.departments
  add column if not exists requires_team_head_approval boolean not null default false,
  add column if not exists team_head_emails text not null default '';

alter table public.tickets
  add column if not exists team_head_approved_by uuid references public.profiles(id),
  add column if not exists team_head_approved_by_name text,
  add column if not exists team_head_approved_at timestamptz,
  add column if not exists team_head_remark text;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'team_head', 'finance', 'admin', 'ceo'));

alter table public.user_credentials drop constraint if exists user_credentials_role_check;
alter table public.user_credentials
  add constraint user_credentials_role_check
  check (role in ('user', 'team_head', 'finance', 'admin', 'ceo'));

alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets
  add constraint tickets_status_check
  check (status in (
    'awaiting_team_head', 'awaiting_ceo', 'pending',
    'partial', 'paid', 'completed', 'rejected'
  ));

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
  if v_role not in ('user', 'team_head', 'finance', 'admin', 'ceo') then
    v_role := 'user';
  end if;
  v_approved := v_role <> 'user';

  begin
    v_dept := nullif(new.raw_user_meta_data->>'department_id', '')::uuid;
  exception when others then
    v_dept := null;
  end;

  insert into public.profiles
    (id, email, full_name, role, is_approved, approved_at, department_id)
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

-- Team heads can see and update tickets only for their own department.
drop policy if exists "Users see own tickets; finance/admin/ceo see all" on public.tickets;
drop policy if exists "Users see own; staff see permitted tickets" on public.tickets;
create policy "Users see own; staff see permitted tickets"
  on public.tickets for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('finance', 'admin', 'ceo')
          or (p.role = 'team_head' and p.department_id = tickets.department_id)
        )
    )
  );

drop policy if exists "Users update own; finance/admin/ceo update all" on public.tickets;
drop policy if exists "Users update own; staff update permitted tickets" on public.tickets;
create policy "Users update own; staff update permitted tickets"
  on public.tickets for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('finance', 'admin', 'ceo')
          or (
            p.role = 'team_head'
            and p.department_id = tickets.department_id
            and tickets.status = 'awaiting_team_head'
          )
        )
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('finance', 'admin', 'ceo')
          or (
            p.role = 'team_head'
            and p.department_id = tickets.department_id
            and tickets.status in ('awaiting_ceo', 'rejected')
          )
        )
    )
  );

notify pgrst, 'reload schema';
