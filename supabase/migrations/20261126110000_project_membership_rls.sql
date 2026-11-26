insert into public.project_members (project_id, user_id, invited_by, role, status)
select p.id, p.created_by, p.created_by, 'admin', 'accepted'
from public.projects p
where not exists (
  select 1
  from public.project_members pm
  where pm.project_id = p.id
    and pm.user_id = p.created_by
)
on conflict (project_id, user_id) do nothing;

drop policy if exists "Project members can view projects" on public.projects;
create policy "Project members can view projects"
  on public.projects for select to authenticated
  using (public.is_project_member(id));

drop policy if exists "Users can view their own chat read cursors"
  on public.project_chat_reads;
create policy "Users can view their own chat read cursors"
  on public.project_chat_reads for select to authenticated
  using (
    user_id = auth.uid()
    and public.is_project_member(project_id)
  );

drop policy if exists "Users can create their own chat read cursors"
  on public.project_chat_reads;
create policy "Users can create their own chat read cursors"
  on public.project_chat_reads for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_project_member(project_id)
  );

drop policy if exists "Users can update their own chat read cursors"
  on public.project_chat_reads;
create policy "Users can update their own chat read cursors"
  on public.project_chat_reads for update to authenticated
  using (
    user_id = auth.uid()
    and public.is_project_member(project_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_project_member(project_id)
  );
