create or replace function public.delete_project_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
begin
  select project_id
    into target_project_id
    from public.project_teams
    where id = p_team_id;

  if target_project_id is null then
    raise exception 'The selected team does not exist';
  end if;

  if not public.is_project_admin(target_project_id)
    and not public.is_project_team_leader(p_team_id) then
    raise exception 'Only the project admin or this team leader can delete the team';
  end if;

  delete from public.project_teams
  where id = p_team_id;
end;
$$;

revoke all on function public.delete_project_team(uuid) from public;
grant execute on function public.delete_project_team(uuid) to authenticated;
