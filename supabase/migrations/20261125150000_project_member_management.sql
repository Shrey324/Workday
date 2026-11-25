create or replace function public.remove_project_member(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
  target_status text;
begin
  if not public.is_project_admin(p_project_id) then
    raise exception 'Only the project admin can remove project members';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'The project admin cannot remove themselves';
  end if;

  select role, status into target_role, target_status
  from public.project_members
  where project_id = p_project_id and user_id = p_user_id;

  if target_role is distinct from 'member' or target_status is distinct from 'accepted' then
    raise exception 'The selected user is not an active project member';
  end if;

  delete from public.project_team_members tm
  using public.project_teams t
  where tm.team_id = t.id
    and t.project_id = p_project_id
    and tm.user_id = p_user_id;

  delete from public.project_members
  where project_id = p_project_id and user_id = p_user_id;
end;
$$;

create or replace function public.remove_project_team_member(
  p_team_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
begin
  select project_id into target_project_id
  from public.project_teams
  where id = p_team_id;

  if target_project_id is null then
    raise exception 'The selected team does not exist';
  end if;
  if not public.is_project_admin(target_project_id)
    and not public.is_project_team_leader(p_team_id) then
    raise exception 'Only the project admin or this team leader can remove team members';
  end if;

  delete from public.project_team_members
  where team_id = p_team_id and user_id = p_user_id;

  if not found then
    raise exception 'The selected user is not a member of this team';
  end if;
end;
$$;

revoke all on function public.remove_project_member(uuid, uuid) from public;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
revoke all on function public.remove_project_team_member(uuid, uuid) from public;
grant execute on function public.remove_project_team_member(uuid, uuid) to authenticated;
