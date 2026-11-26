create or replace function public.delete_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_project_admin(p_project_id) then
    raise exception 'Only the project admin can delete this project';
  end if;

  delete from public.projects
  where id = p_project_id;

  if not found then
    raise exception 'The selected project does not exist';
  end if;
end;
$$;

revoke all on function public.delete_project(uuid) from public;
grant execute on function public.delete_project(uuid) to authenticated;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      ''
    )
  )
  on conflict (id) do update
    set full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert or update of raw_user_meta_data, email on auth.users
for each row execute function public.handle_new_user_profile();

insert into public.profiles as current_profile (id, full_name)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    ''
  )
from auth.users as users
on conflict (id) do update
  set full_name = excluded.full_name
  where nullif(trim(current_profile.full_name), '') is null;

drop policy if exists "Authenticated users can search profiles"
  on public.profiles;
create policy "Authenticated users can search profiles"
  on public.profiles for select to authenticated
  using (true);

grant select on public.profiles to authenticated;
