drop policy if exists "Project members can view projects" on public.projects;
create policy "Project members can view projects"
  on public.projects for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_project_member(id)
  );

create or replace function public.list_pending_project_invitations()
returns table (
  project_id uuid,
  project_title text,
  inviter_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pm.project_id,
    p.title,
    coalesce(nullif(inviter.full_name, ''), 'Someone')
  from public.project_members pm
  join public.projects p on p.id = pm.project_id
  left join public.profiles inviter on inviter.id = pm.invited_by
  where pm.user_id = auth.uid()
    and pm.status = 'pending'
  order by pm.created_at desc;
$$;

revoke all on function public.list_pending_project_invitations() from public;
grant execute on function public.list_pending_project_invitations() to authenticated;

alter table public.project_notifications
  drop constraint if exists project_notifications_type_check;
alter table public.project_notifications
  add constraint project_notifications_type_check
  check (
    type in (
      'project_invite',
      'project_deadline_changed',
      'team_task_deadline_changed',
      'team_task_assigned'
    )
  );

alter table public.project_notifications
  add column if not exists task_id uuid
    references public.project_team_tasks(id) on delete cascade,
  add column if not exists read_at timestamptz;

create policy "Users can mark their own notifications as read"
  on public.project_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant update (read_at) on public.project_notifications to authenticated;

create table if not exists public.project_chat_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table public.project_chat_reads enable row level security;
create policy "Users can view their own chat read cursors"
  on public.project_chat_reads for select to authenticated
  using (user_id = auth.uid() and public.is_project_member(project_id));
create policy "Users can create their own chat read cursors"
  on public.project_chat_reads for insert to authenticated
  with check (user_id = auth.uid() and public.is_project_member(project_id));
create policy "Users can update their own chat read cursors"
  on public.project_chat_reads for update to authenticated
  using (user_id = auth.uid() and public.is_project_member(project_id))
  with check (user_id = auth.uid() and public.is_project_member(project_id));
grant select, insert, update on public.project_chat_reads to authenticated;

create or replace function public.list_project_conversation_summaries()
returns table (
  project_id uuid,
  project_title text,
  latest_message text,
  latest_message_at timestamptz,
  latest_author_name text,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    case
      when latest.attachment_name is not null then latest.attachment_name
      else latest.text
    end,
    latest.created_at,
    coalesce(nullif(author.full_name, ''), 'Project update'),
    (
      select count(*)
      from public.project_chat_messages unread
      where unread.project_id = p.id
        and unread.author_id is distinct from auth.uid()
        and unread.created_at > coalesce(read_cursor.last_read_at, membership.created_at)
    )
  from public.project_members membership
  join public.projects p on p.id = membership.project_id
  left join public.project_chat_reads read_cursor
    on read_cursor.project_id = p.id
    and read_cursor.user_id = auth.uid()
  left join lateral (
    select message.text, message.attachment_name, message.author_id, message.created_at
    from public.project_chat_messages message
    where message.project_id = p.id
    order by message.created_at desc
    limit 1
  ) latest on true
  left join public.profiles author on author.id = latest.author_id
  where membership.user_id = auth.uid()
    and membership.status = 'accepted'
  order by latest.created_at desc nulls last, p.title;
$$;

revoke all on function public.list_project_conversation_summaries() from public;
grant execute on function public.list_project_conversation_summaries() to authenticated;

create or replace function public.notify_team_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  target_team_name text;
  assigner_name text;
begin
  select team.project_id, team.name
    into target_project_id, target_team_name
    from public.project_teams team
    where team.id = new.team_id;

  select coalesce(nullif(profile.full_name, ''), 'A team leader')
    into assigner_name
    from public.profiles profile
    where profile.id = auth.uid();
  assigner_name := coalesce(assigner_name, 'A team leader');

  insert into public.project_notifications (
    user_id,
    project_id,
    type,
    title,
    body,
    task_id
  )
  select
    team_member.user_id,
    target_project_id,
    'team_task_assigned',
    'New team task',
    'You have been assigned "' || new.title || '" by ' || assigner_name
      || ' (' || target_team_name || ').',
    new.id
  from public.project_team_members team_member
  join public.project_members membership
    on membership.project_id = target_project_id
    and membership.user_id = team_member.user_id
    and membership.status = 'accepted'
  where team_member.team_id = new.team_id;

  return new;
end;
$$;

drop trigger if exists team_task_assignment_notification on public.project_team_tasks;
create trigger team_task_assignment_notification
after insert on public.project_team_tasks
for each row execute function public.notify_team_task_assigned();
