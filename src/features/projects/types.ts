export type ProjectStatus = 'In progress' | 'Completed' | 'On hold';

export type UserProfile = {
  id: string;
  fullName: string;
};

export type ProjectMember = UserProfile & {
  role: 'admin' | 'member';
};

export type Project = {
  id: string;
  title: string;
  description: string;
  deadline: string;
  creatorId: string;
  creatorName: string;
  members: ProjectMember[];
  status: ProjectStatus;
  tint: string;
};

export type ProjectInvitation = {
  projectId: string;
  projectTitle: string;
  inviterName: string;
};

export type ProjectNotice = {
  id: string;
  projectId: string;
  type:
    | 'project_deadline_changed'
    | 'team_task_deadline_changed'
    | 'team_task_assigned';
  title: string;
  body: string;
  createdAt: string;
  taskId: string | null;
};

export type ProjectConversationSummary = {
  projectId: string;
  projectTitle: string;
  latestMessage: string | null;
  latestMessageAt: string | null;
  latestAuthorName: string | null;
  unreadCount: number;
};

export type ChatAttachment = {
  name: string;
  storagePath: string;
  mimeType?: string;
  size?: number;
};

export type ChatMessage = {
  id: string;
  authorId: string | null;
  author: string;
  initials: string;
  createdAt: string;
  text: string;
  kind: 'user' | 'system';
  attachment?: ChatAttachment;
};

export type ProjectTeamMember = ProjectMember & {
  teamRole: 'member' | 'leader';
};

export type ProjectTeam = {
  id: string;
  name: string;
  createdBy: string | null;
  members: ProjectTeamMember[];
};

export type TeamTask = {
  id: string;
  teamId: string;
  title: string;
  deadline: string;
  status: 'in_progress' | 'done' | 'needs_more_time';
};

export type MyProjectTask = TeamTask & {
  projectId: string;
  projectName: string;
  teamName: string;
};
