create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

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

insert into public.profiles (id, full_name)
select id, coalesce(
  nullif(trim(raw_user_meta_data ->> 'full_name'), ''),
  nullif(split_part(coalesce(email, ''), '@', 1), ''),
  ''
)
from auth.users
on conflict (id) do update set full_name = excluded.full_name;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  deadline date not null,
  status text not null default 'In progress'
    check (status in ('In progress', 'Completed', 'On hold')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid not null references auth.users (id),
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'denied', 'left')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.project_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  type text not null check (
    type in (
      'project_invite',
      'project_deadline_changed',
      'team_task_deadline_changed'
    )
  ),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  message_type text not null default 'user' check (message_type in ('user', 'system')),
  text text not null default '',
  attachment_name text,
  attachment_path text,
  attachment_type text,
  attachment_size bigint,
  created_at timestamptz not null default now(),
  check (
    (attachment_path is null and attachment_name is null)
    or (attachment_path is not null and attachment_name is not null)
  )
);

create table if not exists public.project_teams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_team_members (
  team_id uuid not null references public.project_teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'leader')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.project_team_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.project_teams (id) on delete cascade,
  title text not null,
  deadline date not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'done', 'needs_more_time')),
  created_at timestamptz not null default now()
);

create index if not exists project_members_user_status_idx
  on public.project_members (user_id, status);
create index if not exists project_notifications_user_created_idx
  on public.project_notifications (user_id, created_at desc);
create index if not exists project_chat_messages_project_created_idx
  on public.project_chat_messages (project_id, created_at);
create index if not exists project_teams_project_idx
  on public.project_teams (project_id);
create index if not exists project_team_tasks_team_idx
  on public.project_team_tasks (team_id);

create or replace function public.is_project_admin(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project
      and p.created_by = auth.uid()
  );
$$;

create or replace function public.create_project_with_invites(
  p_title text,
  p_description text,
  p_deadline date,
  p_status text,
  p_invitee_ids uuid[]
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  created_project_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required to create a project';
  end if;

  insert into public.projects (title, description, deadline, status, created_by)
  values (trim(p_title), trim(p_description), p_deadline, p_status, auth.uid())
  returning id into created_project_id;

  insert into public.project_members (project_id, user_id, invited_by, role, status)
  select created_project_id, invitee_id, auth.uid(), 'member', 'pending'
  from (
    select distinct invitees.invitee_id
    from unnest(coalesce(p_invitee_ids, array[]::uuid[])) as invitees(invitee_id)
  ) invitees
  where invitee_id <> auth.uid();

  return created_project_id;
end;
$$;

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

revoke all on function public.create_project_with_invites(text, text, date, text, uuid[]) from public;
grant execute on function public.create_project_with_invites(text, text, date, text, uuid[]) to authenticated;
revoke all on function public.create_project_team_with_members(uuid, text, uuid[], uuid[]) from public;
grant execute on function public.create_project_team_with_members(uuid, text, uuid[], uuid[]) to authenticated;

create or replace function public.is_project_member(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project
      and pm.user_id = auth.uid()
      and pm.status = 'accepted'
  );
$$;

create or replace function public.is_project_invitee(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project
      and pm.user_id = auth.uid()
      and pm.status = 'pending'
  );
$$;

create or replace function public.is_project_team_leader(target_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_team_members tm
    join public.project_teams t on t.id = tm.team_id
    where tm.team_id = target_team
      and tm.user_id = auth.uid()
      and tm.role = 'leader'
      and public.is_project_member(t.project_id)
  );
$$;

create or replace function public.add_project_creator_as_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, invited_by, role, status)
  values (new.id, new.created_by, new.created_by, 'admin', 'accepted');
  return new;
end;
$$;

drop trigger if exists project_creator_membership on public.projects;
create trigger project_creator_membership
after insert on public.projects
for each row execute function public.add_project_creator_as_admin();

create or replace function public.notify_project_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inviter_name text;
  project_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select coalesce(nullif(pf.full_name, ''), 'Someone')
    into inviter_name
    from public.profiles pf
    where pf.id = new.invited_by;
  select p.title into project_name
    from public.projects p
    where p.id = new.project_id;

  insert into public.project_notifications (user_id, project_id, type, title, body)
  values (
    new.user_id,
    new.project_id,
    'project_invite',
    'Project invitation',
    inviter_name || ' wanted to add you to the project "' || project_name || '".'
  );
  return new;
end;
$$;

drop trigger if exists project_member_invitation_notification on public.project_members;
create trigger project_member_invitation_notification
after insert on public.project_members
for each row execute function public.notify_project_invitation();

create or replace function public.prevent_project_member_field_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.project_id <> old.project_id
    or new.user_id <> old.user_id
    or new.invited_by <> old.invited_by
    or new.role <> old.role then
    raise exception 'Project membership identity and role cannot be changed';
  end if;
  if not (
    (old.status = 'pending' and new.status in ('accepted', 'denied'))
    or (old.status = 'accepted' and new.status = 'left')
  ) then
    raise exception 'Invalid project membership status transition';
  end if;
  return new;
end;
$$;

drop trigger if exists project_member_status_transition on public.project_members;
create trigger project_member_status_transition
before update on public.project_members
for each row execute function public.prevent_project_member_field_changes();

create or replace function public.notify_project_deadline_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changer_name text;
  deadline_label text;
begin
  if new.deadline is not distinct from old.deadline then
    return new;
  end if;

  select coalesce(nullif(pf.full_name, ''), 'A project admin')
    into changer_name
    from public.profiles pf
    where pf.id = auth.uid();
  deadline_label := to_char(new.deadline, 'Mon DD, YYYY');

  insert into public.project_notifications (user_id, project_id, type, title, body)
  select pm.user_id, new.id, 'project_deadline_changed', 'Project deadline changed',
         changer_name || ' changed the project deadline to ' || deadline_label || '.'
  from public.project_members pm
  where pm.project_id = new.id
    and pm.status = 'accepted';

  insert into public.project_chat_messages (project_id, author_id, message_type, text)
  values (
    new.id,
    null,
    'system',
    changer_name || ' changed the project deadline to ' || deadline_label || '.'
  );
  return new;
end;
$$;

drop trigger if exists project_deadline_change_notification on public.projects;
create trigger project_deadline_change_notification
after update of deadline on public.projects
for each row execute function public.notify_project_deadline_change();

create or replace function public.notify_team_task_deadline_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_project_id uuid;
  changer_name text;
  deadline_label text;
begin
  if new.deadline is not distinct from old.deadline then
    return new;
  end if;

  select t.project_id into changed_project_id
  from public.project_teams t
  where t.id = new.team_id;

  select coalesce(nullif(pf.full_name, ''), 'A team leader')
    into changer_name
    from public.profiles pf
    where pf.id = auth.uid();
  deadline_label := to_char(new.deadline, 'Mon DD, YYYY');

  insert into public.project_notifications (user_id, project_id, type, title, body)
  select pm.user_id, changed_project_id, 'team_task_deadline_changed', 'Team task deadline changed',
         changer_name || ' changed the deadline for "' || new.title || '" to ' || deadline_label || '.'
  from public.project_members pm
  where pm.project_id = changed_project_id
    and pm.status = 'accepted';

  insert into public.project_chat_messages (project_id, author_id, message_type, text)
  values (
    changed_project_id,
    null,
    'system',
    changer_name || ' changed the deadline for "' || new.title || '" to ' || deadline_label || '.'
  );
  return new;
end;
$$;

drop trigger if exists team_task_deadline_change_notification on public.project_team_tasks;
create trigger team_task_deadline_change_notification
after update of deadline on public.project_team_tasks
for each row execute function public.notify_team_task_deadline_change();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_notifications enable row level security;
alter table public.project_chat_messages enable row level security;
alter table public.project_teams enable row level security;
alter table public.project_team_members enable row level security;
alter table public.project_team_tasks enable row level security;

create policy "Authenticated users can search profiles"
  on public.profiles for select to authenticated using (true);

create policy "Users can update their profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "Project members can view projects"
  on public.projects for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_project_member(id)
    or public.is_project_invitee(id)
  );

create policy "Users can create their own projects"
  on public.projects for insert to authenticated
  with check (created_by = auth.uid());

create policy "Project admins can update project details"
  on public.projects for update to authenticated
  using (public.is_project_admin(id))
  with check (public.is_project_admin(id) and created_by = auth.uid());

create policy "Project members can view project membership"
  on public.project_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_project_admin(project_id)
    or public.is_project_member(project_id)
  );

create policy "Project admins can invite members"
  on public.project_members for insert to authenticated
  with check (
    public.is_project_admin(project_id)
    and invited_by = auth.uid()
    and role = 'member'
    and status = 'pending'
  );

create policy "Members can respond to their own invitations or leave"
  on public.project_members for update to authenticated
  using (user_id = auth.uid() and status in ('pending', 'accepted'))
  with check (
    user_id = auth.uid()
    and role = 'member'
    and status in ('accepted', 'denied', 'left')
  );

create policy "Users can view their own project notifications"
  on public.project_notifications for select to authenticated
  using (user_id = auth.uid());

create policy "Project members can read project chat"
  on public.project_chat_messages for select to authenticated
  using (public.is_project_member(project_id));

create policy "Project members can send chat messages"
  on public.project_chat_messages for insert to authenticated
  with check (
    public.is_project_member(project_id)
    and author_id = auth.uid()
    and message_type = 'user'
  );

create policy "Project members can view their teams"
  on public.project_teams for select to authenticated
  using (public.is_project_member(project_id));

create policy "Project admins can create teams"
  on public.project_teams for insert to authenticated
  with check (public.is_project_admin(project_id));

create policy "Project members can view team membership"
  on public.project_team_members for select to authenticated
  using (
    exists (
      select 1
      from public.project_teams t
      where t.id = team_id
        and public.is_project_member(t.project_id)
    )
  );

create policy "Project admins can add team members and leaders"
  on public.project_team_members for insert to authenticated
  with check (
    exists (
      select 1
      from public.project_teams t
      where t.id = team_id
        and public.is_project_admin(t.project_id)
    )
    and exists (
      select 1
      from public.project_members pm
      join public.project_teams t on t.project_id = pm.project_id
      where t.id = project_team_members.team_id
        and pm.user_id = project_team_members.user_id
        and pm.status = 'accepted'
    )
  );

create policy "Project members can read team tasks"
  on public.project_team_tasks for select to authenticated
  using (
    exists (
      select 1
      from public.project_teams t
      where t.id = team_id
        and public.is_project_member(t.project_id)
    )
  );

create policy "Admins and team leaders can create tasks"
  on public.project_team_tasks for insert to authenticated
  with check (
    public.is_project_team_leader(team_id)
    or exists (
      select 1
      from public.project_teams t
      where t.id = team_id
        and public.is_project_admin(t.project_id)
    )
  );

create policy "Admins and team leaders can update tasks"
  on public.project_team_tasks for update to authenticated
  using (
    public.is_project_team_leader(team_id)
    or exists (
      select 1
      from public.project_teams t
      where t.id = team_id
        and public.is_project_admin(t.project_id)
    )
  )
  with check (
    public.is_project_team_leader(team_id)
    or exists (
      select 1
      from public.project_teams t
      where t.id = team_id
        and public.is_project_admin(t.project_id)
    )
  );

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.projects to authenticated;
grant select, insert, update on public.project_members to authenticated;
grant select on public.project_notifications to authenticated;
grant select, insert on public.project_chat_messages to authenticated;
grant select, insert on public.project_teams to authenticated;
grant select, insert on public.project_team_members to authenticated;
grant select, insert, update on public.project_team_tasks to authenticated;

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

create policy "Project members can upload chat files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and public.is_project_member((storage.foldername(name))[1]::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "Project members can read chat files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-files'
    and public.is_project_member((storage.foldername(name))[1]::uuid)
  );

create policy "Project members can remove their own chat files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_project_member((storage.foldername(name))[1]::uuid)
  );

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'project_members',
      'project_notifications',
      'project_chat_messages',
      'project_teams',
      'project_team_members',
      'project_team_tasks'
    ] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
