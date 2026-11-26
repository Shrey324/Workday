drop policy if exists "Project admins can create teams"
  on public.project_teams;
create policy "Project admins can create teams"
  on public.project_teams for insert to authenticated
  with check (public.is_project_admin(project_id));

create or replace function public.create_project_team_with_members(
  p_project_id uuid,
  p_name text,
  p_member_ids uuid[],
  p_leader_ids uuid[]
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  created_team_id uuid;
  selected_member_ids uuid[];
  selected_leader_ids uuid[];
begin
  if not public.is_project_admin(p_project_id) then
    raise exception 'Only the project admin can create teams';
  end if;

  select coalesce(array_agg(distinct member_id), array[]::uuid[])
    into selected_member_ids
    from unnest(coalesce(p_member_ids, array[]::uuid[])) as selected_members(member_id);
  select coalesce(array_agg(distinct leader_id), array[]::uuid[])
    into selected_leader_ids
    from unnest(coalesce(p_leader_ids, array[]::uuid[])) as selected_leaders(leader_id);

  if cardinality(selected_member_ids) = 0 then
    raise exception 'Choose at least one project member for the team';
  end if;
  if exists (
    select 1
    from unnest(selected_leader_ids) as selected_leaders(leader_id)
    where not (selected_leaders.leader_id = any(selected_member_ids))
  ) then
    raise exception 'Team leaders must also be selected as team members';
  end if;

  insert into public.project_teams (project_id, name)
  values (p_project_id, trim(p_name))
  returning id into created_team_id;

  insert into public.project_team_members (team_id, user_id, role)
  select created_team_id, selected_members.member_id,
         case when selected_members.member_id = any(selected_leader_ids)
           then 'leader' else 'member' end
  from unnest(selected_member_ids) as selected_members(member_id);

  return created_team_id;
end;
$$;

revoke all on function public.create_project_team_with_members(uuid, text, uuid[], uuid[]) from public;
grant execute on function public.create_project_team_with_members(uuid, text, uuid[], uuid[]) to authenticated;

create or replace function public.delete_project_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  target_creator_id uuid;
begin
  select team.project_id, project.created_by
    into target_project_id, target_creator_id
    from public.project_teams as team
    join public.projects as project on project.id = team.project_id
    where team.id = p_team_id;

  if not found then
    raise exception 'The selected team does not exist';
  end if;

  if not public.is_project_admin(target_project_id)
    and not public.is_project_team_leader(p_team_id) then
    raise exception 'Only a project admin or this team leader can delete the team';
  end if;

  if target_creator_id is distinct from auth.uid() then
    raise exception 'Only the user who created this team can delete it';
  end if;

  delete from public.project_teams
  where id = p_team_id;
end;
$$;

revoke all on function public.delete_project_team(uuid) from public;
grant execute on function public.delete_project_team(uuid) to authenticated;
