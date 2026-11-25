import { supabase } from '../../../lib/supabase';
import type {
  ChatAttachment,
  ChatMessage,
  Project,
  ProjectInvitation,
  ProjectNotice,
  ProjectTeam,
  ProjectTeamMember,
  TeamTask,
  UserProfile,
} from './types';

type ProfileRow = { id: string; full_name: string };

const profileName = (profile?: ProfileRow) => profile?.full_name || 'Unknown member';

async function getProfiles(ids: string[]) {
  if (ids.length === 0) return new Map<string, ProfileRow>();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', ids);
  if (error) throw error;
  return new Map((data ?? []).map((profile) => [profile.id, profile]));
}

export async function searchProjectUsers(query: string, currentUserId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .ilike('full_name', `%${query.trim()}%`)
    .neq('id', currentUserId)
    .order('full_name')
    .limit(8);
  if (error) throw error;
  return (data ?? []).map(
    (profile): UserProfile => ({ id: profile.id, fullName: profile.full_name })
  );
}

export async function listProjects(): Promise<Project[]> {
  const { data: projectRows, error } = await supabase
    .from('projects')
    .select('id, title, description, deadline, status, created_by')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!projectRows?.length) return [];

  const ids = projectRows.map((project) => project.id);
  const { data: memberRows, error: membersError } = await supabase
    .from('project_members')
    .select('project_id, user_id, role')
    .in('project_id', ids)
    .eq('status', 'accepted');
  if (membersError) throw membersError;

  const profileIds = [
    ...new Set([
      ...projectRows.map((project) => project.created_by),
      ...(memberRows ?? []).map((member) => member.user_id),
    ]),
  ];
  const profiles = await getProfiles(profileIds);

  return projectRows.map((project) => ({
    id: project.id,
    title: project.title,
    description: project.description,
    deadline: project.deadline,
    creatorId: project.created_by,
    creatorName: profileName(profiles.get(project.created_by)),
    status: project.status,
    tint: '#EAE8F1',
    members: (memberRows ?? [])
      .filter((member) => member.project_id === project.id)
      .map((member) => ({
        id: member.user_id,
        fullName: profileName(profiles.get(member.user_id)),
        role: member.role,
      })),
  }));
}

export async function listProjectInvitations(
  userId: string
): Promise<ProjectInvitation[]> {
  const { data: memberRows, error } = await supabase
    .from('project_members')
    .select('project_id, invited_by')
    .eq('user_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
  if (!memberRows?.length) return [];

  const projectIds = [...new Set(memberRows.map((member) => member.project_id))];
  const inviterIds = [...new Set(memberRows.map((member) => member.invited_by))];
  const [{ data: projects, error: projectsError }, profiles] = await Promise.all([
    supabase.from('projects').select('id, title').in('id', projectIds),
    getProfiles(inviterIds),
  ]);
  if (projectsError) throw projectsError;
  const titles = new Map((projects ?? []).map((project) => [project.id, project.title]));

  return memberRows.map((member) => ({
    projectId: member.project_id,
    projectTitle: titles.get(member.project_id) ?? 'Project',
    inviterName: profileName(profiles.get(member.invited_by)),
  }));
}

export async function listProjectNotices(userId: string): Promise<ProjectNotice[]> {
  const { data, error } = await supabase
    .from('project_notifications')
    .select('id, project_id, title, body, created_at')
    .eq('user_id', userId)
    .neq('type', 'project_invite')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map((notice) => ({
    id: notice.id,
    projectId: notice.project_id,
    title: notice.title,
    body: notice.body,
    createdAt: notice.created_at,
  }));
}

export async function createProject(input: {
  title: string;
  description: string;
  deadline: string;
  status: Project['status'];
  creatorId: string;
  inviteeIds: string[];
}) {
  const { data: projectId, error } = await supabase.rpc(
    'create_project_with_invites',
    {
      p_title: input.title,
      p_description: input.description,
      p_deadline: input.deadline,
      p_status: input.status,
      p_invitee_ids: [...new Set(input.inviteeIds)].filter(
        (id) => id !== input.creatorId
      ),
    }
  );
  if (error) throw error;
  if (!projectId) throw new Error('Project creation returned no project ID.');
  return projectId;
}

export async function respondToProjectInvitation(
  projectId: string,
  userId: string,
  accepted: boolean
) {
  const { error } = await supabase
    .from('project_members')
    .update({ status: accepted ? 'accepted' : 'denied' })
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function leaveProject(projectId: string, userId: string) {
  const { error } = await supabase
    .from('project_members')
    .update({ status: 'left' })
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'accepted');
  if (error) throw error;
}

export async function updateProjectDetails(
  projectId: string,
  input: {
    title: string;
    description: string;
    deadline: string;
    status: Project['status'];
  }
) {
  const { error } = await supabase
    .from('projects')
    .update({
      title: input.title,
      description: input.description,
      deadline: input.deadline,
      status: input.status,
    })
    .eq('id', projectId);
  if (error) throw error;
}

export async function listProjectMessages(projectId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('project_chat_messages')
    .select(
      'id, author_id, message_type, text, created_at, attachment_name, attachment_path, attachment_type, attachment_size'
    )
    .eq('project_id', projectId)
    .order('created_at');
  if (error) throw error;

  const authorIds = [
    ...new Set(
      (data ?? []).flatMap((message) =>
        message.author_id ? [message.author_id] : []
      )
    ),
  ];
  const profiles = await getProfiles(authorIds);
  return (data ?? []).map((message) => {
    const author = message.author_id
      ? profileName(profiles.get(message.author_id))
      : 'Project update';
    const attachment: ChatAttachment | undefined = message.attachment_path
      ? {
          name: message.attachment_name ?? 'Shared file',
          storagePath: message.attachment_path,
          mimeType: message.attachment_type ?? undefined,
          size: message.attachment_size ?? undefined,
        }
      : undefined;
    return {
      id: message.id,
      authorId: message.author_id,
      author,
      initials: author === 'Project update' ? 'PR' : authorInitials(author),
      createdAt: message.created_at,
      text: message.text ?? '',
      kind: message.message_type,
      attachment,
    };
  });
}

export async function sendProjectMessage(input: {
  projectId: string;
  userId: string;
  text: string;
  attachment?: { name: string; uri: string; mimeType?: string; size?: number };
}) {
  let attachmentPath: string | null = null;
  if (input.attachment) {
    const response = await fetch(input.attachment.uri);
    if (!response.ok) throw new Error('Unable to read the selected file.');
    const file = await response.blob();
    const safeName = input.attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    attachmentPath = `${input.projectId}/${input.userId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(attachmentPath, file, {
        contentType: input.attachment.mimeType,
        upsert: false,
      });
    if (uploadError) throw uploadError;
  }

  const { error } = await supabase.from('project_chat_messages').insert({
    project_id: input.projectId,
    author_id: input.userId,
    message_type: 'user',
    text: input.text,
    attachment_name: input.attachment?.name ?? null,
    attachment_path: attachmentPath,
    attachment_type: input.attachment?.mimeType ?? null,
    attachment_size: input.attachment?.size ?? null,
  });
  if (error) {
    if (attachmentPath) {
      const { error: cleanupError } = await supabase.storage
        .from('project-files')
        .remove([attachmentPath]);
      if (cleanupError) {
        console.error('Unable to clean up an unsent project attachment:', cleanupError);
      }
    }
    throw error;
  }
}

export async function createProjectTeam(input: {
  projectId: string;
  name: string;
  memberIds: string[];
  leaderIds: string[];
}) {
  const { data: teamId, error } = await supabase.rpc(
    'create_project_team_with_members',
    {
      p_project_id: input.projectId,
      p_name: input.name,
      p_member_ids: [...new Set(input.memberIds)],
      p_leader_ids: [...new Set(input.leaderIds)],
    }
  );
  if (error) throw error;
  if (!teamId) throw new Error('Team creation returned no team ID.');
  return teamId;
}

export async function listProjectTeams(projectId: string): Promise<ProjectTeam[]> {
  const { data: teams, error } = await supabase
    .from('project_teams')
    .select('id, name')
    .eq('project_id', projectId)
    .order('created_at');
  if (error) throw error;
  if (!teams?.length) return [];

  const { data: teamMembers, error: membersError } = await supabase
    .from('project_team_members')
    .select('team_id, user_id, role')
    .in(
      'team_id',
      teams.map((team) => team.id)
    );
  if (membersError) throw membersError;
  const profiles = await getProfiles(
    [...new Set((teamMembers ?? []).map((member) => member.user_id))]
  );
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    members: (teamMembers ?? [])
      .filter((member) => member.team_id === team.id)
      .map(
        (member): ProjectTeamMember => ({
          id: member.user_id,
          fullName: profileName(profiles.get(member.user_id)),
          role: 'member',
          teamRole: member.role,
        })
      ),
  }));
}

export async function listTeamTasks(teamIds: string[]): Promise<TeamTask[]> {
  if (teamIds.length === 0) return [];
  const { data, error } = await supabase
    .from('project_team_tasks')
    .select('id, team_id, title, deadline, status')
    .in('team_id', teamIds)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((task) => ({
    id: task.id,
    teamId: task.team_id,
    title: task.title,
    deadline: task.deadline,
    status: task.status,
  }));
}

export async function createTeamTask(input: {
  teamId: string;
  title: string;
  deadline: string;
}) {
  const { error } = await supabase.from('project_team_tasks').insert({
    team_id: input.teamId,
    title: input.title,
    deadline: input.deadline,
  });
  if (error) throw error;
}

export async function updateTeamTask(
  taskId: string,
  input: { title: string; deadline: string }
) {
  const { error } = await supabase
    .from('project_team_tasks')
    .update(input)
    .eq('id', taskId);
  if (error) throw error;
}

export async function updateTeamTaskStatus(
  taskId: string,
  status: TeamTask['status']
) {
  const { error } = await supabase
    .from('project_team_tasks')
    .update({ status })
    .eq('id', taskId);
  if (error) throw error;
}

export async function createProjectFileUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from('project-files')
    .createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export function authorInitials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
