import { useCallback, useEffect, useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { AccountPicker } from '../components/projects/AccountPicker';
import { TeamTaskCard } from '../components/projects/TeamTaskCard';
import { Feather } from '@expo/vector-icons';
import {
  createProject as createProjectRecord,
  createProjectFileUrl,
  createProjectTeam,
  createTeamTask,
  deleteProject as deleteProjectRecord,
  deleteProjectTeam as deleteProjectTeamRecord,
  inviteProjectMembers,
  leaveProject,
  listMyProjectTasks,
  listProjectConversationSummaries,
  listProjectInvitations,
  listProjectMemberIds,
  listProjectMessages,
  listProjectNotices,
  listProjects,
  listProjectTeams,
  listTeamTasks,
  markProjectConversationRead,
  markProjectNotificationRead,
  removeProjectMember,
  removeProjectTeamMember,
  respondToProjectInvitation,
  searchProjectUsers,
  sendProjectMessage,
  updateProjectDetails,
  updateTeamTask,
  updateTeamTaskStatus,
} from '../features/projects/api';
import type {
  ChatMessage,
  MyProjectTask,
  Project,
  ProjectConversationSummary,
  ProjectInvitation,
  ProjectNotice,
  ProjectStatus,
  ProjectTeam,
  TeamTask,
  UserProfile,
} from '../features/projects/types';

type FilterStatus = 'All' | ProjectStatus;
type WorkspaceTab = 'home' | 'projects' | 'tasks' | 'messages';

type Attachment = {
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
};

const colors = {
  black: '#151515',
  ink: '#202124',
  muted: '#777A80',
  faint: '#A5A7AB',
  line: '#ECEDEF',
  canvas: '#F7F7F6',
  white: '#FFFFFF',
  green: '#17845D',
  greenBg: '#E8F4EE',
  amber: '#A76712',
  amberBg: '#FBF2E3',
  orange: '#D76A24',
};

const createRealtimeTopic = (topic: string) =>
  `${topic}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const formatDeadline = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && toDateInputValue(date) === value;
};

const isNearingDeadline = (project: Project) => {
  if (project.status !== 'In progress') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(`${project.deadline}T00:00:00`);
  const daysUntilDeadline =
    (deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000);
  return daysUntilDeadline >= 0 && daysUntilDeadline <= 7;
};

const formatFileSize = (size?: number) => {
  if (size === undefined) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const formatChatDay = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  today.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);

  if (day.getTime() === today.getTime()) return 'Today';
  if (day.getTime() === yesterday.getTime()) return 'Yesterday';
  const thisWeek = new Date(today);
  thisWeek.setDate(thisWeek.getDate() - 6);
  if (day >= thisWeek) {
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const formatChatTime = (value: string) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

const daysUntilDeadline = (value: string) => {
  const deadline = new Date(`${value}T00:00:00`);
  if (Number.isNaN(deadline.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
};

const isTaskOverdue = (task: MyProjectTask) =>
  task.status !== 'done' && (daysUntilDeadline(task.deadline) ?? 0) < 0;

const isTaskDueSoon = (task: MyProjectTask) => {
  const days = daysUntilDeadline(task.deadline);
  return task.status !== 'done' && days !== null && days >= 0 && days <= 3;
};

const formatConversationTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return formatChatTime(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function TabTwoScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('home');
  const [myTasks, setMyTasks] = useState<MyProjectTask[]>([]);
  const [conversations, setConversations] = useState<ProjectConversationSummary[]>([]);
  const [selectedMyTask, setSelectedMyTask] = useState<MyProjectTask | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('All');
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectSection, setActiveProjectSection] =
    useState<'teams' | 'chat'>('teams');
  const [mutedByProject, setMutedByProject] = useState<Record<string, boolean>>({});
  const [isProjectActionsOpen, setIsProjectActionsOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isTaskDetailsOpen, setIsTaskDetailsOpen] = useState(false);
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [addMemberQuery, setAddMemberQuery] = useState('');
  const [addMemberSuggestions, setAddMemberSuggestions] = useState<UserProfile[]>([]);
  const [selectedProjectInvitees, setSelectedProjectInvitees] = useState<UserProfile[]>([]);
  const [projectUserIds, setProjectUserIds] = useState<string[]>([]);
  const [isSearchingProjectUsers, setIsSearchingProjectUsers] = useState(false);
  const [isSendingProjectInvites, setIsSendingProjectInvites] = useState(false);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [notices, setNotices] = useState<ProjectNotice[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserProfile[]>([]);
  const [memberSuggestions, setMemberSuggestions] = useState<UserProfile[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [memberInput, setMemberInput] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftDeadline, setDraftDeadline] = useState('');
  const [draftStatus, setDraftStatus] = useState<ProjectStatus>('In progress');
  const [messagesByProject, setMessagesByProject] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [teamsByProject, setTeamsByProject] = useState<Record<string, ProjectTeam[]>>({});
  const [tasksByTeam, setTasksByTeam] = useState<Record<string, TeamTask[]>>({});
  const [messageDraft, setMessageDraft] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [mediaOnly, setMediaOnly] = useState(false);
  const [isTeamCreateOpen, setIsTeamCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [teamLeaderIds, setTeamLeaderIds] = useState<string[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskTeamId, setTaskTeamId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [isProjectEditOpen, setIsProjectEditOpen] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState('');
  const [projectDescriptionDraft, setProjectDescriptionDraft] = useState('');
  const [projectDeadlineDraft, setProjectDeadlineDraft] = useState('');
  const [projectStatusDraft, setProjectStatusDraft] =
    useState<ProjectStatus>('In progress');

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const isProjectAdmin = !!activeProject && activeProject.creatorId === currentUserId;
  const refreshWorkspace = useCallback(async (userId: string) => {
    const nextProjects = await listProjects();
    const [nextInvitations, nextNotices, nextTasks, nextConversations] = await Promise.all([
      listProjectInvitations(),
      listProjectNotices(userId),
      listMyProjectTasks(userId, nextProjects),
      listProjectConversationSummaries(),
    ]);
    setProjects(nextProjects);
    setInvitations(nextInvitations);
    setNotices(nextNotices);
    setMyTasks(nextTasks);
    setConversations(nextConversations);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error('Unable to load the signed-in user:', error);
        Alert.alert('Unable to load account', error.message);
        setIsLoadingProjects(false);
        return;
      }
      if (!data.user) {
        setIsLoadingProjects(false);
        return;
      }
      if (!isMounted) return;
      setCurrentUserId(data.user.id);
    };
    void loadUser();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    let isMounted = true;
    const loadWorkspace = async () => {
      try {
        await refreshWorkspace(currentUserId);
      } catch (error) {
        console.error('Unable to load project workspace:', error);
        Alert.alert(
          'Unable to load projects',
          error instanceof Error ? error.message : 'Please try again.'
        );
      } finally {
        if (isMounted) setIsLoadingProjects(false);
      }
    };
    void loadWorkspace();

    const channel = supabase
      .channel(createRealtimeTopic(`project-inbox-${currentUserId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_members',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          void refreshWorkspace(currentUserId).catch((error) =>
            console.error('Unable to refresh project invitations:', error)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          void refreshWorkspace(currentUserId).catch((error) =>
            console.error('Unable to refresh project notifications:', error)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_chat_messages',
        },
        () => {
          void listProjectConversationSummaries()
            .then(setConversations)
            .catch((error) =>
              console.error('Unable to refresh project messages:', error)
            );
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_team_tasks',
        },
        () => {
          void refreshWorkspace(currentUserId).catch((error) =>
            console.error('Unable to refresh assigned project tasks:', error)
          );
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, refreshWorkspace]);

  useEffect(() => {
    if (!activeProjectId) return;
    let isMounted = true;
    const refreshProject = async () => {
      try {
        const [messages, teams] = await Promise.all([
          listProjectMessages(activeProjectId),
          listProjectTeams(activeProjectId),
        ]);
        if (!isMounted) return;
        setMessagesByProject((current) => ({ ...current, [activeProjectId]: messages }));
        setTeamsByProject((current) => ({ ...current, [activeProjectId]: teams }));
        const tasks = await listTeamTasks(teams.map((team) => team.id));
        if (!isMounted) return;
        setTasksByTeam((current) => {
          const next = { ...current };
          teams.forEach((team) => {
            next[team.id] = tasks.filter((task) => task.teamId === team.id);
          });
          return next;
        });
      } catch (error) {
        console.error('Unable to load project conversation and teams:', error);
        Alert.alert(
          'Unable to load project',
          error instanceof Error ? error.message : 'Please try again.'
        );
      }
    };
    void refreshProject();

    const channel = supabase
      .channel(createRealtimeTopic(`project-detail-${activeProjectId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_chat_messages',
          filter: `project_id=eq.${activeProjectId}`,
        },
        () => {
          void listProjectMessages(activeProjectId)
            .then((messages) =>
              setMessagesByProject((current) => ({
                ...current,
                [activeProjectId]: messages,
              }))
            )
            .catch((error) => console.error('Unable to refresh project chat:', error));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_teams',
          filter: `project_id=eq.${activeProjectId}`,
        },
        () => {
          void listProjectTeams(activeProjectId)
            .then((teams) => setTeamsByProject((current) => ({
              ...current,
              [activeProjectId]: teams,
            })))
            .catch((error) => console.error('Unable to refresh project teams:', error));
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) return;
    const activeTeams = teamsByProject[activeProjectId] ?? [];
    if (activeTeams.length === 0) return;
    const teamIds = activeTeams.map((team) => team.id);
    const channels = activeTeams.map((team) =>
      supabase
        .channel(createRealtimeTopic(`team-tasks-${team.id}`))
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'project_team_tasks',
            filter: `team_id=eq.${team.id}`,
          },
          () => {
            void listTeamTasks(teamIds)
              .then((tasks) => {
                setTasksByTeam((current) => {
                  const next = { ...current };
                  teamIds.forEach((teamId) => {
                    next[teamId] = tasks.filter((task) => task.teamId === teamId);
                  });
                  return next;
                });
              })
              .catch((error) => console.error('Unable to refresh team tasks:', error));
          }
        )
        .subscribe()
    );
    return () => {
      channels.forEach((channel) => void supabase.removeChannel(channel));
    };
  }, [activeProjectId, teamsByProject]);

  useEffect(() => {
    if (!isCreateOpen || !currentUserId || memberInput.trim().length < 2) {
      setMemberSuggestions([]);
      setIsSearchingMembers(false);
      return;
    }
    let isMounted = true;
    const timer = setTimeout(() => {
      setIsSearchingMembers(true);
      void searchProjectUsers(
        memberInput,
        currentUserId,
        selectedUsers.map((user) => user.id)
      )
        .then((users) => {
          if (isMounted) setMemberSuggestions(users);
        })
        .catch((error) => {
          if (!isMounted) return;
          console.error('Unable to search signed-up users:', error);
          Alert.alert('User search failed', 'Please try searching again.');
        })
        .finally(() => {
          if (isMounted) setIsSearchingMembers(false);
        });
    }, 250);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [currentUserId, isCreateOpen, memberInput, selectedUsers]);

  useEffect(() => {
    if (!isAddMembersOpen || !currentUserId || addMemberQuery.trim().length < 2) {
      setAddMemberSuggestions([]);
      setIsSearchingProjectUsers(false);
      return;
    }
    let isMounted = true;
    const timer = setTimeout(() => {
      setIsSearchingProjectUsers(true);
      void searchProjectUsers(addMemberQuery, currentUserId, [
        ...projectUserIds,
        ...selectedProjectInvitees.map((user) => user.id),
      ])
        .then((users) => {
          if (isMounted) setAddMemberSuggestions(users);
        })
        .catch((error) => {
          console.error('Unable to search signed-up users:', error);
          Alert.alert('User search failed', 'Please try searching again.');
        })
        .finally(() => {
          if (isMounted) setIsSearchingProjectUsers(false);
        });
    }, 250);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    addMemberQuery,
    currentUserId,
    isAddMembersOpen,
    projectUserIds,
    selectedProjectInvitees,
  ]);

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesFilter = filter === 'All' || project.status === filter;
      const matchesSearch =
        !query ||
        project.title.toLowerCase().includes(query) ||
        project.creatorName.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [filter, projects, search]);

  const inProgressCount = projects.filter(
    (project) => project.status === 'In progress'
  ).length;
  const nearingDeadlineCount = projects.filter(isNearingDeadline).length;
  const sortedMyTasks = useMemo(
    () =>
      [...myTasks].sort(
        (left, right) =>
          left.deadline.localeCompare(right.deadline) ||
          left.title.localeCompare(right.title)
      ),
    [myTasks]
  );
  const taskInProgressCount = myTasks.filter(
    (task) => task.status === 'in_progress'
  ).length;
  const overdueTaskCount = myTasks.filter(isTaskOverdue).length;
  const notificationCount = invitations.length + notices.length;
  const unreadMessageCount = conversations.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0
  );

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        Alert.alert('Logout failed', error.message);
        return;
      }
      router.replace('/');
    } catch (error) {
      console.error('Unable to log out:', error);
      Alert.alert('Error', 'Unable to log out. Please try again.');
    }
  };

  const resetCreateForm = () => {
    setDraftTitle('');
    setDraftDescription('');
    setDraftDeadline('');
    setDraftStatus('In progress');
    setSelectedUsers([]);
    setMemberInput('');
    setMemberSuggestions([]);
    setIsSearchingMembers(false);
  };

  const addMember = (user: UserProfile) => {
    if (selectedUsers.some((member) => member.id === user.id)) return;
    setSelectedUsers((current) => [...current, user]);
    setMemberInput('');
  };

  const createProject = async () => {
    const title = draftTitle.trim();
    if (!title) {
      Alert.alert('Add a project title', 'Enter a title before creating the project.');
      return;
    }
    if (!draftDescription.trim()) {
      Alert.alert('Add a description', 'Give your team a little context for this project.');
      return;
    }
    if (!isValidDate(draftDeadline)) {
      Alert.alert('Check the deadline', 'Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    if (!currentUserId) {
      Alert.alert('Sign in required', 'Sign in before creating a project.');
      return;
    }
    try {
      await createProjectRecord({
        title,
        description: draftDescription.trim(),
        deadline: draftDeadline,
        status: draftStatus,
        creatorId: currentUserId,
        inviteeIds: selectedUsers.map((user) => user.id),
      });
      await refreshWorkspace(currentUserId);
      setIsCreateOpen(false);
      setFilter('All');
      setSearch('');
      resetCreateForm();
    } catch (error) {
      console.error('Unable to create project:', error);
      Alert.alert(
        'Unable to create project',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const pickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'image/*',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        setPendingAttachment({
          name: file.name,
          uri: file.uri,
          mimeType: file.mimeType,
          size: file.size,
        });
      }
    } catch (error) {
      console.error('Unable to select an attachment:', error);
      Alert.alert('Unable to attach file', 'Please try selecting the file again.');
    }
  };

  const sendMessage = async () => {
    if (!activeProject || (!messageDraft.trim() && !pendingAttachment)) return;
    if (!currentUserId) return;
    setIsSendingMessage(true);
    try {
      await sendProjectMessage({
        projectId: activeProject.id,
        userId: currentUserId,
        text: messageDraft.trim(),
        attachment: pendingAttachment ?? undefined,
      });
      setMessageDraft('');
      setPendingAttachment(null);
      const messages = await listProjectMessages(activeProject.id);
      setMessagesByProject((current) => ({ ...current, [activeProject.id]: messages }));
    } catch (error) {
      console.error('Unable to send project message:', error);
      Alert.alert(
        'Unable to send message',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsSendingMessage(false);
    }
  };

  const confirmLeaveProject = (project: Project) => {
    if (!currentUserId || project.creatorId === currentUserId) return;
    Alert.alert(
      'Leave project?',
      'Are you sure you want to leave the project?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: () => {
            void leaveProject(project.id, currentUserId)
              .then(async () => {
                if (activeProjectId === project.id) setActiveProjectId(null);
                await refreshWorkspace(currentUserId);
              })
              .catch((error) => {
                console.error('Unable to leave project:', error);
                Alert.alert(
                  'Unable to leave project',
                  error instanceof Error ? error.message : 'Please try again.'
                );
              });
          },
        },
      ]
    );
  };

  const respondToInvitation = async (
    invitation: ProjectInvitation,
    accepted: boolean
  ) => {
    if (!currentUserId) return;
    try {
      await respondToProjectInvitation(invitation.projectId, currentUserId, accepted);
      await refreshWorkspace(currentUserId);
    } catch (error) {
      console.error('Unable to respond to project invitation:', error);
      Alert.alert(
        'Unable to update invitation',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const navigateToTab = (tab: WorkspaceTab) => {
    setActiveProjectId(null);
    setActiveTab(tab);
    setIsNotificationsOpen(false);
    setIsTaskDetailsOpen(false);
  };

  const openTaskFromNotification = async (notice: ProjectNotice) => {
    if (!currentUserId || !notice.taskId) return;
    try {
      let task = myTasks.find((item) => item.id === notice.taskId);
      if (!task) {
        const loadedTasks = await listMyProjectTasks(currentUserId, projects);
        setMyTasks(loadedTasks);
        task = loadedTasks.find((item) => item.id === notice.taskId);
      }
      if (!task) {
        throw new Error('This task is no longer assigned to one of your teams.');
      }
      await markProjectNotificationRead(notice.id, currentUserId);
      setNotices((current) => current.filter((item) => item.id !== notice.id));
      setIsNotificationsOpen(false);
      setActiveProjectId(null);
      setActiveTab('tasks');
      setSelectedMyTask(task);
      setIsTaskDetailsOpen(true);
    } catch (error) {
      console.error('Unable to open the assigned task:', error);
      Alert.alert(
        'Unable to open task',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const openProjectNotice = async (notice: ProjectNotice) => {
    if (!currentUserId) return;
    try {
      await markProjectNotificationRead(notice.id, currentUserId);
      setNotices((current) => current.filter((item) => item.id !== notice.id));
      setIsNotificationsOpen(false);
      openProject(notice.projectId);
    } catch (error) {
      console.error('Unable to mark the project notification as read:', error);
      Alert.alert(
        'Unable to open notification',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const toggleProjectMute = (projectId: string) => {
    setMutedByProject((current) => ({
      ...current,
      [projectId]: !current[projectId],
    }));
  };

  const openAddMembersSheet = async () => {
    if (!activeProject || !isProjectAdmin) return;
    try {
      const existingIds = await listProjectMemberIds(activeProject.id);
      setProjectUserIds(existingIds);
      setAddMemberQuery('');
      setSelectedProjectInvitees([]);
      setIsAddMembersOpen(true);
    } catch (error) {
      console.error('Unable to prepare project member search:', error);
      Alert.alert(
        'Unable to add members',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const confirmDeleteProject = () => {
    if (!activeProject || !isProjectAdmin || !currentUserId) return;
    const projectId = activeProject.id;
    const projectTitle = activeProject.title;
    const userId = currentUserId;
    setIsProjectActionsOpen(false);
    Alert.alert(
      'Delete project?',
      `Delete ${projectTitle} and all its project data? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete project',
          style: 'destructive',
          onPress: () => {
            void deleteProjectRecord(projectId)
              .then(async () => {
                setProjects((current) =>
                  current.filter((project) => project.id !== projectId)
                );
                setActiveProjectId(null);
                try {
                  await refreshWorkspace(userId);
                } catch (error) {
                  console.error(
                    'Project deleted, but the workspace could not refresh:',
                    error
                  );
                  Alert.alert(
                    'Project deleted',
                    'The project was deleted, but the workspace could not refresh. Reopen the workspace to update it.'
                  );
                }
              })
              .catch((error) => {
                console.error('Unable to delete project:', error);
                Alert.alert(
                  'Unable to delete project',
                  error instanceof Error ? error.message : 'Please try again.'
                );
              });
          },
        },
      ]
    );
  };

  const sendProjectInvitations = async () => {
    if (
      !activeProject ||
      !currentUserId ||
      isSendingProjectInvites ||
      selectedProjectInvitees.length === 0
    ) return;
    const projectId = activeProject.id;
    const projectTitle = activeProject.title;
    const inviterId = currentUserId;
    const inviteeIds = selectedProjectInvitees.map((user) => user.id);
    let invitationCount: number;
    setIsSendingProjectInvites(true);
    try {
      invitationCount = await inviteProjectMembers(
        projectId,
        inviterId,
        inviteeIds
      );
    } catch (error) {
      console.error('Unable to invite project members:', error);
      Alert.alert(
        'Unable to send invitations',
        error instanceof Error ? error.message : 'Please try again.'
      );
      return;
    } finally {
      setIsSendingProjectInvites(false);
    }

    setProjectUserIds((current) => [
      ...current,
      ...inviteeIds,
    ]);
    setSelectedProjectInvitees([]);
    setAddMemberQuery('');
    setIsAddMembersOpen(false);
    try {
      await refreshWorkspace(currentUserId);
    } catch (error) {
      console.error('Invitations were sent, but the workspace could not refresh:', error);
      Alert.alert(
        'Invitations sent',
        'The invitations were sent, but the project list could not be refreshed. Reopen the project to update it.'
      );
      return;
    }
    Alert.alert(
      'Invitations sent',
      `${invitationCount} user${invitationCount === 1 ? '' : 's'} invited to ${projectTitle}.`
    );
  };

  const confirmRemoveProjectMember = (member: UserProfile) => {
    if (
      !activeProject ||
      !isProjectAdmin ||
      !currentUserId ||
      member.id === activeProject.creatorId
    ) return;
    Alert.alert(
      'Remove project member?',
      `Remove ${member.fullName} from ${activeProject.title}? They will lose access to its chat and files.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void removeProjectMember(activeProject.id, member.id)
              .then(async () => {
                try {
                  const [, teams] = await Promise.all([
                    refreshWorkspace(currentUserId),
                    listProjectTeams(activeProject.id),
                  ]);
                  setTeamsByProject((current) => ({
                    ...current,
                    [activeProject.id]: teams,
                  }));
                } catch (error) {
                  console.error(
                    'Project member was removed, but the workspace could not refresh:',
                    error
                  );
                  Alert.alert(
                    'Member removed',
                    'The member was removed, but the project data could not be refreshed. Reopen the project to update it.'
                  );
                }
              })
              .catch((error) => {
                console.error('Unable to remove project member:', error);
                Alert.alert(
                  'Unable to remove member',
                  error instanceof Error ? error.message : 'Please try again.'
                );
              });
          },
        },
      ]
    );
  };

  const confirmRemoveTeamMember = (team: ProjectTeam, member: UserProfile) => {
    Alert.alert(
      'Remove team member?',
      `Remove ${member.fullName} from ${team.name}? They will remain in the project.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void removeProjectTeamMember(team.id, member.id)
              .then(async () => {
                if (!activeProject) return;
                try {
                  const teams = await listProjectTeams(activeProject.id);
                  setTeamsByProject((current) => ({
                    ...current,
                    [activeProject.id]: teams,
                  }));
                } catch (error) {
                  console.error(
                    'Team member was removed, but the team could not refresh:',
                    error
                  );
                  Alert.alert(
                    'Team member removed',
                    'The member was removed, but the team could not be refreshed. Reopen the project to update it.'
                  );
                }
              })
              .catch((error) => {
                console.error('Unable to remove team member:', error);
                Alert.alert(
                  'Unable to remove team member',
                  error instanceof Error ? error.message : 'Please try again.'
                );
              });
          },
        },
      ]
    );
  };

  const confirmDeleteProjectTeam = (team: ProjectTeam) => {
    if (!activeProject || !currentUserId) return;
    const projectId = activeProject.id;
    Alert.alert(
      'Delete team?',
      `Delete ${team.name} and its assigned tasks?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteProjectTeamRecord(team.id)
              .then(() => {
                setTeamsByProject((current) => ({
                  ...current,
                  [projectId]: (current[projectId] ?? []).filter(
                    (currentTeam) => currentTeam.id !== team.id
                  ),
                }));
                setTasksByTeam((current) => {
                  const next = { ...current };
                  delete next[team.id];
                  return next;
                });
              })
              .catch((error) => {
                console.error('Unable to delete project team:', error);
                Alert.alert(
                  'Unable to delete team',
                  error instanceof Error ? error.message : 'Please try again.'
                );
              });
          },
        },
      ]
    );
  };

  const openProject = (projectId: string) => {
    setIsProjectActionsOpen(false);
    setActiveProjectSection('teams');
    setActiveProjectId(projectId);
    setMessageDraft('');
    setPendingAttachment(null);
    setMediaOnly(false);
    if (currentUserId) {
      void markProjectConversationRead(projectId, currentUserId)
        .then(() => listProjectConversationSummaries())
        .then(setConversations)
        .catch((error) =>
          console.error('Unable to mark the project conversation as read:', error)
        );
    }
  };

  const saveProjectDetails = async () => {
    if (!activeProject) return;
    if (!projectTitleDraft.trim()) {
      Alert.alert('Add a project name', 'Project name cannot be empty.');
      return;
    }
    if (!projectDescriptionDraft.trim()) {
      Alert.alert('Add a description', 'Project description cannot be empty.');
      return;
    }
    if (!isValidDate(projectDeadlineDraft)) {
      Alert.alert('Check the deadline', 'Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    try {
      await updateProjectDetails(activeProject.id, {
        title: projectTitleDraft.trim(),
        description: projectDescriptionDraft.trim(),
        deadline: projectDeadlineDraft,
        status: projectStatusDraft,
      });
      setProjects((current) =>
        current.map((project) =>
          project.id === activeProject.id
            ? {
              ...project,
              title: projectTitleDraft.trim(),
              description: projectDescriptionDraft.trim(),
              deadline: projectDeadlineDraft,
              status: projectStatusDraft,
            }
            : project
        )
      );
      setIsProjectEditOpen(false);
    } catch (error) {
      console.error('Unable to update project details:', error);
      Alert.alert(
        'Unable to update project',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const openTaskEditor = (teamId: string, task?: TeamTask) => {
    setTaskTeamId(teamId);
    setEditingTaskId(task?.id ?? null);
    setTaskTitle(task?.title ?? '');
    setTaskDeadline(task?.deadline ?? '');
    setIsTaskModalOpen(true);
  };

  const saveTeamTask = async () => {
    if (!taskTeamId) return;
    if (!taskTitle.trim()) {
      Alert.alert('Add a task', 'Enter a task description.');
      return;
    }
    if (!isValidDate(taskDeadline)) {
      Alert.alert('Check the deadline', 'Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    try {
      if (editingTaskId) {
        await updateTeamTask(editingTaskId, {
          title: taskTitle.trim(),
          deadline: taskDeadline,
        });
      } else {
        await createTeamTask({
          teamId: taskTeamId,
          title: taskTitle.trim(),
          deadline: taskDeadline,
        });
      }
      const updatedTasks = await listTeamTasks(
        (teamsByProject[activeProjectId ?? ''] ?? []).map((team) => team.id)
      );
      setTasksByTeam((current) => {
        const next = { ...current };
        Object.keys(next).forEach((teamId) => {
          next[teamId] = updatedTasks.filter((task) => task.teamId === teamId);
        });
        return next;
      });
      setIsTaskModalOpen(false);
      setTaskTeamId(null);
      setEditingTaskId(null);
      setTaskTitle('');
      setTaskDeadline('');
    } catch (error) {
      console.error('Unable to save team task:', error);
      Alert.alert(
        'Unable to save task',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const setTaskStatus = async (task: TeamTask, status: TeamTask['status']) => {
    try {
      await updateTeamTaskStatus(task.id, status);
      setTasksByTeam((current) => ({
        ...current,
        [task.teamId]: (current[task.teamId] ?? []).map((item) =>
          item.id === task.id ? { ...item, status } : item
        ),
      }));
      setMyTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, status } : item
        )
      );
    } catch (error) {
      console.error('Unable to update task status:', error);
      Alert.alert(
        'Unable to update task',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const createTeam = async () => {
    if (!activeProject || !teamName.trim()) {
      Alert.alert('Name the team', 'Enter a name for this team.');
      return;
    }
    if (teamMemberIds.length === 0) {
      Alert.alert('Add team members', 'Choose at least one project member.');
      return;
    }
    try {
      await createProjectTeam({
        projectId: activeProject.id,
        name: teamName.trim(),
        memberIds: teamMemberIds,
        leaderIds: teamLeaderIds,
      });
      const teams = await listProjectTeams(activeProject.id);
      setTeamsByProject((current) => ({ ...current, [activeProject.id]: teams }));
      setTeamName('');
      setTeamMemberIds([]);
      setTeamLeaderIds([]);
      setIsTeamCreateOpen(false);
    } catch (error) {
      console.error('Unable to create project team:', error);
      Alert.alert(
        'Unable to create team',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const openFile = async (storagePath: string) => {
    try {
      const url = await createProjectFileUrl(storagePath);
      await Linking.openURL(url);
    } catch (error) {
      console.error('Unable to open project file:', error);
      Alert.alert(
        'Unable to open file',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  if (activeProject) {
    const messages = messagesByProject[activeProject.id] ?? [];
    const visibleMessages = mediaOnly
      ? messages.filter((message) => message.attachment)
      : messages;
    const teams = teamsByProject[activeProject.id] ?? [];
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <KeyboardAvoidingView
          style={styles.detailScreen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={styles.detailHeader}>
            <Pressable
              onPress={() => {
                setIsProjectActionsOpen(false);
                setActiveProjectId(null);
              }}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back to projects"
            >
              <Text style={styles.backArrow}>‹</Text>
            </Pressable>
            <View style={styles.detailHeaderText}>
              <Text style={styles.detailEyebrow}>PROJECT</Text>
              <Text style={styles.detailHeaderTitle} numberOfLines={1}>
                {activeProject.title}
              </Text>
            </View>
            <View style={styles.projectActionsAnchor}>
              <Pressable
                onPress={() => setIsProjectActionsOpen((open) => !open)}
                style={styles.headerIconButton}
                accessibilityRole="button"
                accessibilityLabel="Project options"
                accessibilityState={{ expanded: isProjectActionsOpen }}
              >
                <Feather name="more-vertical" size={20} color={colors.ink} />
              </Pressable>
              {isProjectActionsOpen && (
                <View style={styles.projectActionsDropdown}>
                  {isProjectAdmin && (
                    <Pressable
                      onPress={() => {
                        setIsProjectActionsOpen(false);
                        void openAddMembersSheet();
                      }}
                      style={styles.projectActionItem}
                      accessibilityRole="button"
                    >
                      <Feather name="user-plus" size={15} color={colors.ink} />
                      <Text style={styles.projectActionText}>Add members</Text>
                    </Pressable>
                  )}
                  {isProjectAdmin && (
                    <Pressable
                      onPress={() => {
                        setIsProjectActionsOpen(false);
                        setProjectTitleDraft(activeProject.title);
                        setProjectDescriptionDraft(activeProject.description);
                        setProjectDeadlineDraft(activeProject.deadline);
                        setProjectStatusDraft(activeProject.status);
                        setIsProjectEditOpen(true);
                      }}
                      style={styles.projectActionItem}
                      accessibilityRole="button"
                    >
                      <Feather name="edit-2" size={15} color={colors.ink} />
                      <Text style={styles.projectActionText}>Edit project</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      setIsProjectActionsOpen(false);
                      toggleProjectMute(activeProject.id);
                    }}
                    style={styles.projectActionItem}
                    accessibilityRole="button"
                  >
                    <Feather
                      name={mutedByProject[activeProject.id] ? 'volume-2' : 'volume-x'}
                      size={15}
                      color={colors.ink}
                    />
                    <Text style={styles.projectActionText}>
                      {mutedByProject[activeProject.id] ? 'Unmute project' : 'Mute project'}
                    </Text>
                  </Pressable>
                  {isProjectAdmin && (
                    <Pressable
                      onPress={confirmDeleteProject}
                      style={styles.projectActionItem}
                      accessibilityRole="button"
                    >
                      <Feather name="trash-2" size={15} color="#C64F3D" />
                      <Text style={styles.deleteProjectActionText}>Delete project</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </View>

          {isProjectActionsOpen && (
            <Pressable
              onPress={() => setIsProjectActionsOpen(false)}
              style={styles.projectActionsDismiss}
              accessibilityRole="button"
              accessibilityLabel="Close project options"
            />
          )}
          <ScrollView
            style={styles.detailScroll}
            contentContainerStyle={styles.detailScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.projectSummaryCard}>
              <View style={styles.summaryTopLine}>
                <StatusBadge status={activeProject.status} />
                <Text style={styles.detailDueText}>
                  Due {formatDeadline(activeProject.deadline)}
                </Text>
              </View>
              <Text style={styles.summaryTitle}>{activeProject.title}</Text>
              <Text style={styles.summaryDescription}>{activeProject.description}</Text>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryMetaRow}>
                <View>
                  <Text style={styles.metaLabel}>CREATED BY</Text>
                  <View style={styles.creatorLine}>
                    <Text style={styles.metaValue}>{activeProject.creatorName}</Text>
                    <Text style={styles.adminLabel}>Admin</Text>
                  </View>
                </View>
                <Pressable
                  style={styles.detailMemberMeta}
                  onPress={() => setIsMemberListOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${activeProject.members.length} project members`}
                >
                  <Text style={styles.metaLabel}>TEAM</Text>
                  <View style={styles.avatarStack}>
                    {activeProject.members.slice(0, 4).map((member, index) => (
                      <Avatar
                        key={member.id}
                        name={member.fullName}
                        tint={index % 2 === 0 ? '#EEE9E2' : '#E5EAF2'}
                        small
                      />
                    ))}
                    <Text style={styles.memberCount}>
                      {activeProject.members.length} members
                    </Text>
                  </View>
                  <View style={styles.memberNames}>
                    {activeProject.members.map((member) => (
                      <Text key={member.id} style={styles.memberName}>
                        {member.fullName}
                        {member.role === 'admin' ? (
                          <Text style={styles.adminLabel}>  Admin</Text>
                        ) : null}
                      </Text>
                    ))}
                  </View>
                </Pressable>
              </View>
            </View>

            <View style={styles.detailSectionTabs}>
              <Pressable
                onPress={() => setActiveProjectSection('teams')}
                style={[
                  styles.detailSectionTab,
                  activeProjectSection === 'teams' && styles.detailSectionTabActive,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: activeProjectSection === 'teams' }}
              >
                <Feather
                  name="users"
                  size={15}
                  color={activeProjectSection === 'teams' ? colors.orange : colors.muted}
                />
                <Text
                  style={[
                    styles.detailSectionTabLabel,
                    activeProjectSection === 'teams' && styles.detailSectionTabLabelActive,
                  ]}
                >
                  Project teams
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveProjectSection('chat')}
                style={[
                  styles.detailSectionTab,
                  activeProjectSection === 'chat' && styles.detailSectionTabActive,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: activeProjectSection === 'chat' }}
              >
                <Feather
                  name="message-circle"
                  size={15}
                  color={activeProjectSection === 'chat' ? colors.orange : colors.muted}
                />
                <Text
                  style={[
                    styles.detailSectionTabLabel,
                    activeProjectSection === 'chat' && styles.detailSectionTabLabelActive,
                  ]}
                >
                  Team chat
                </Text>
              </Pressable>
            </View>

            {activeProjectSection === 'teams' && (
              <>
            <View style={styles.teamsHeading}>
              <View>
                <Text style={styles.chatTitle}>Project teams</Text>
                <Text style={styles.chatSubtitle}>Smaller groups and their shared tasks.</Text>
              </View>
              {isProjectAdmin && (
                <Pressable
                  onPress={() => {
                    setTeamName('');
                    setTeamMemberIds([]);
                    setTeamLeaderIds([]);
                    setIsTeamCreateOpen(true);
                  }}
                  style={styles.smallActionButton}
                  accessibilityRole="button"
                >
                  <Text style={styles.smallActionText}>Create teams</Text>
                </Pressable>
              )}
            </View>
            {teams.length === 0 ? (
              <Text style={styles.noTeamsText}>
                {isProjectAdmin
                  ? 'Create a team and choose from accepted project members.'
                  : 'No teams have been created yet.'}
              </Text>
            ) : (
              teams.map((team) => {
                const isTeamLeader = team.members.some(
                  (member) =>
                    member.id === currentUserId && member.teamRole === 'leader'
                );
                const canManageTeam =
                  isProjectAdmin || isTeamLeader;
                const canDeleteTeam =
                  team.createdBy === currentUserId &&
                  (isProjectAdmin || isTeamLeader);
                return (
                  <View key={team.id} style={styles.teamCard}>
                    <View style={styles.teamHeader}>
                      <View style={styles.teamHeaderText}>
                        <Text style={styles.teamName}>{team.name}</Text>
                        <View style={styles.teamMemberList}>
                          {team.members.length ? (
                            team.members.map((member) => (
                              <View key={member.id} style={styles.teamMemberRow}>
                                <Text style={styles.teamMemberNames}>
                                  {member.fullName}
                                  {member.teamRole === 'leader' ? ' · Team Leader' : ''}
                                </Text>
                                {canManageTeam && member.id !== currentUserId && (
                                  <Pressable
                                    onPress={() => confirmRemoveTeamMember(team, member)}
                                    style={styles.removeTeamMemberButton}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${member.fullName} from ${team.name}`}
                                  >
                                    <Feather name="user-x" size={15} color={colors.muted} />
                                  </Pressable>
                                )}
                              </View>
                            ))
                          ) : (
                            <Text style={styles.teamMemberNames}>No members</Text>
                          )}
                        </View>
                      </View>
                      {canManageTeam && (
                        <View style={styles.teamActions}>
                          <Pressable
                            onPress={() => openTaskEditor(team.id)}
                            style={styles.smallActionButton}
                            accessibilityRole="button"
                          >
                            <Text style={styles.smallActionText}>Assign task</Text>
                          </Pressable>
                          {canDeleteTeam && (
                            <Pressable
                              onPress={() => confirmDeleteProjectTeam(team)}
                              style={styles.deleteTeamButton}
                              accessibilityRole="button"
                              accessibilityLabel={`Delete ${team.name}`}
                            >
                              <Feather name="x" size={15} color="#C64F3D" />
                            </Pressable>
                          )}
                        </View>
                      )}
                    </View>
                    {(tasksByTeam[team.id] ?? []).length === 0 ? (
                      <Text style={styles.noTasksText}>No tasks assigned yet.</Text>
                    ) : (
                      (tasksByTeam[team.id] ?? []).map((task) => (
                        <TeamTaskCard
                          key={task.id}
                          task={task}
                          canManage={canManageTeam}
                          onEdit={() => openTaskEditor(team.id, task)}
                          onStatusChange={(status) => void setTaskStatus(task, status)}
                        />
                      ))
                    )}
                  </View>
                );
              })
            )}
              </>
            )}

            {activeProjectSection === 'chat' && (
              <>
            <View style={styles.chatHeading}>
              <View>
                <Text style={styles.chatTitle}>Team chat</Text>
                <Text style={styles.chatSubtitle}>The conversation, all in one place.</Text>
              </View>
              <View style={styles.chatTools}>
                <Pressable
                  onPress={() => setMediaOnly((current) => !current)}
                  style={[styles.mediaButton, mediaOnly && styles.mediaButtonActive]}
                  accessibilityRole="button"
                  accessibilityLabel={mediaOnly ? 'Show all chat messages' : 'Show shared media'}
                >
                  <Text style={[styles.mediaButtonText, mediaOnly && styles.mediaButtonTextActive]}>
                    {mediaOnly ? 'All messages' : 'Media'}
                  </Text>
                </Pressable>
                <Text style={styles.chatCount}>{messages.length} messages</Text>
              </View>
            </View>

            {visibleMessages.length === 0 ? (
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatTitle}>
                  {mediaOnly
                    ? 'No shared media yet'
                    : 'Start the conversation'}
                </Text>
                <Text style={styles.emptyChatText}>
                  {mediaOnly
                    ? 'Files shared in this project chat will appear here.'
                    : 'Share an update or ask your team a question.'}
                </Text>
              </View>
            ) : (
              visibleMessages.map((message, index) => {
                const attachment = message.attachment;
                return (
                  <View key={message.id}>
                    {(index === 0 ||
                      formatChatDay(visibleMessages[index - 1].createdAt) !==
                      formatChatDay(message.createdAt)) && (
                        <View style={styles.messageDateRow}>
                          <Text style={styles.messageDate}>{formatChatDay(message.createdAt)}</Text>
                        </View>
                      )}
                    {message.kind === 'system' ? (
                      <View style={styles.systemMessage}>
                        <Text style={styles.systemMessageText}>{message.text}</Text>
                      </View>
                    ) : (
                      <View style={styles.messageRow}>
                        <View
                          style={[
                            styles.messageAvatar,
                            message.authorId === currentUserId && styles.messageAvatarYou,
                          ]}
                        >
                          <Text style={styles.messageAvatarText}>{message.initials}</Text>
                        </View>
                        <View style={styles.messageContent}>
                          <View style={styles.messageMeta}>
                            <Text style={styles.messageAuthor}>{message.author}</Text>
                            <Text style={styles.messageTime}>
                              {formatChatTime(message.createdAt)}
                            </Text>
                          </View>
                          {!!message.text && (
                            <Text style={styles.messageText}>{message.text}</Text>
                          )}
                          {attachment && (
                            <Pressable
                              onPress={() => void openFile(attachment.storagePath)}
                              style={styles.messageAttachment}
                              accessibilityRole="button"
                              accessibilityLabel={`Open ${attachment.name}`}
                            >
                              <View style={styles.fileIcon}>
                                <Text style={styles.fileIconText}>
                                  {fileExtension(attachment.name)}
                                </Text>
                              </View>
                              <View style={styles.fileDetails}>
                                <Text style={styles.fileName} numberOfLines={1}>
                                  {attachment.name}
                                </Text>
                                <Text style={styles.fileSize}>
                                  {formatFileSize(attachment.size) || 'Attached file'}
                                </Text>
                              </View>
                              <Text style={styles.fileCheck}>↗</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
              </>
            )}
          </ScrollView>

          {activeProjectSection === 'chat' && (
            <View style={styles.composerArea}>
            {pendingAttachment && (
              <View style={styles.pendingFile}>
                <Text style={styles.pendingFileText} numberOfLines={1}>
                  {pendingAttachment.name}
                </Text>
                <Pressable
                  onPress={() => setPendingAttachment(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove attachment"
                >
                  <Text style={styles.removeFile}>×</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.composer}>
              <Pressable
                onPress={pickAttachment}
                style={styles.attachButton}
                accessibilityRole="button"
                accessibilityLabel="Attach screenshot or document"
              >
                <Text style={styles.attachButtonText}>＋</Text>
              </Pressable>
              <TextInput
                style={styles.messageInput}
                value={messageDraft}
                onChangeText={setMessageDraft}
                placeholder="Write a message..."
                placeholderTextColor={colors.faint}
                multiline
                maxLength={2000}
                accessibilityLabel="Message"
              />
              <Pressable
                onPress={sendMessage}
                disabled={
                  isSendingMessage || (!messageDraft.trim() && !pendingAttachment)
                }
                style={[
                  styles.sendButton,
                  (isSendingMessage || (!messageDraft.trim() && !pendingAttachment)) &&
                  styles.sendButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                <Text style={styles.sendButtonText}>↑</Text>
              </Pressable>
            </View>
            <Text style={styles.fileHint}>Attach screenshots, PDF, Excel or Word files</Text>
          </View>
          )}
        </KeyboardAvoidingView>
        <WorkspaceBottomNavigation
          activeTab={activeTab}
          onSelect={navigateToTab}
          unreadMessageCount={unreadMessageCount}
        />
        <Modal
          visible={isProjectEditOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsProjectEditOpen(false)}
        >
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogCard}>
              <Text style={styles.dialogTitle}>Edit project details</Text>
              <FormField label="PROJECT NAME">
                <TextInput
                  style={styles.formInput}
                  value={projectTitleDraft}
                  onChangeText={setProjectTitleDraft}
                  maxLength={80}
                />
              </FormField>
              <FormField label="DESCRIPTION">
                <TextInput
                  style={[styles.formInput, styles.descriptionInput]}
                  value={projectDescriptionDraft}
                  onChangeText={setProjectDescriptionDraft}
                  multiline
                  maxLength={500}
                />
              </FormField>
              <FormField label="DEADLINE">
                <TextInput
                  style={styles.formInput}
                  value={projectDeadlineDraft}
                  onChangeText={setProjectDeadlineDraft}
                  placeholder="YYYY-MM-DD"
                  maxLength={10}
                />
              </FormField>
              <FormField label="STATUS">
                <View style={styles.statusOptions}>
                  {(['In progress', 'On hold', 'Completed'] as ProjectStatus[]).map(
                    (status) => (
                      <Pressable
                        key={status}
                        onPress={() => setProjectStatusDraft(status)}
                        style={[
                          styles.statusOption,
                          projectStatusDraft === status && styles.statusOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusOptionText,
                            projectStatusDraft === status && styles.statusOptionTextActive,
                          ]}
                        >
                          {status}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>
              </FormField>
              <View style={styles.dialogActions}>
                <Pressable
                  onPress={() => setIsProjectEditOpen(false)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={saveProjectDetails} style={styles.submitButton}>
                  <Text style={styles.submitButtonText}>Save changes</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          visible={isTeamCreateOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsTeamCreateOpen(false)}
        >
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogCard}>
              <Text style={styles.dialogTitle}>Create team</Text>
              <FormField label="TEAM NAME">
                <TextInput
                  style={styles.formInput}
                  value={teamName}
                  onChangeText={setTeamName}
                  placeholder="e.g. Design"
                  maxLength={60}
                />
              </FormField>
              <Text style={styles.formLabel}>PROJECT MEMBERS</Text>
              <ScrollView style={styles.memberChoiceList}>
                {activeProject.members.map((member) => {
                  const selected = teamMemberIds.includes(member.id);
                  const leader = teamLeaderIds.includes(member.id);
                  return (
                    <View key={member.id} style={styles.teamMemberChoice}>
                      <Pressable
                        onPress={() => {
                          if (selected) {
                            setTeamMemberIds((current) =>
                              current.filter((id) => id !== member.id)
                            );
                            setTeamLeaderIds((current) =>
                              current.filter((id) => id !== member.id)
                            );
                          } else {
                            setTeamMemberIds((current) => [...current, member.id]);
                          }
                        }}
                        style={styles.teamMemberSelect}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                      >
                        <Text style={styles.teamMemberCheckbox}>{selected ? '✓' : '○'}</Text>
                        <Text style={styles.teamMemberChoiceName}>{member.fullName}</Text>
                      </Pressable>
                      {selected && (
                        <Pressable
                          onPress={() =>
                            setTeamLeaderIds((current) =>
                              leader
                                ? current.filter((id) => id !== member.id)
                                : [...current, member.id]
                            )
                          }
                          style={styles.leaderToggle}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: leader }}
                        >
                          <Text style={[styles.leaderToggleText, leader && styles.leaderActive]}>
                            {leader ? 'Team Leader' : 'Make Leader'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
              <View style={styles.dialogActions}>
                <Pressable
                  onPress={() => setIsTeamCreateOpen(false)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={createTeam} style={styles.submitButton}>
                  <Text style={styles.submitButtonText}>Create team</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          visible={isTaskModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsTaskModalOpen(false)}
        >
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogCard}>
              <Text style={styles.dialogTitle}>
                {editingTaskId ? 'Edit team task' : 'Assign team task'}
              </Text>
              <FormField label="TASK">
                <TextInput
                  style={[styles.formInput, styles.descriptionInput]}
                  value={taskTitle}
                  onChangeText={setTaskTitle}
                  placeholder="Describe the work for this team"
                  multiline
                  maxLength={500}
                />
              </FormField>
              <FormField label="DEADLINE">
                <TextInput
                  style={styles.formInput}
                  value={taskDeadline}
                  onChangeText={setTaskDeadline}
                  placeholder="YYYY-MM-DD"
                  maxLength={10}
                />
              </FormField>
              <View style={styles.dialogActions}>
                <Pressable
                  onPress={() => setIsTaskModalOpen(false)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={saveTeamTask} style={styles.submitButton}>
                  <Text style={styles.submitButtonText}>
                    {editingTaskId ? 'Save task' : 'Assign task'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          visible={isMemberListOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsMemberListOpen(false)}
        >
          <View style={styles.sheetBackdrop}>
            <Pressable
              style={styles.sheetDismissArea}
              onPress={() => setIsMemberListOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close member list"
            />
            <View style={styles.bottomSheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeading}>
                <View>
                  <Text style={styles.dialogTitle}>Project members</Text>
                  <Text style={styles.chatSubtitle}>
                    Roles and access for {activeProject.title}.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setIsMemberListOpen(false)}
                  style={styles.sheetCloseButton}
                  accessibilityRole="button"
                  accessibilityLabel="Close member list"
                >
                  <Feather name="x" size={18} color={colors.ink} />
                </Pressable>
              </View>
              <ScrollView style={styles.sheetMemberList}>
                {activeProject.members.map((member) => {
                  const leaderTeams = teams
                    .filter((team) =>
                      team.members.some(
                        (teamMember) =>
                          teamMember.id === member.id &&
                          teamMember.teamRole === 'leader'
                      )
                    )
                    .map((team) => team.name);
                  const roleLabel =
                    member.role === 'admin'
                      ? 'Admin'
                      : leaderTeams.length
                        ? `Team Leader · ${leaderTeams.join(', ')}`
                        : 'Member';
                  return (
                    <View key={member.id} style={styles.memberListRow}>
                      <Avatar
                        name={member.fullName}
                        tint="#EEE9E2"
                        small
                      />
                      <View style={styles.memberListCopy}>
                        <Text style={styles.memberListName}>{member.fullName}</Text>
                        <Text
                          style={[
                            styles.memberListRole,
                            member.role === 'admin' && styles.adminLabel,
                          ]}
                        >
                          {roleLabel}
                        </Text>
                      </View>
                      {isProjectAdmin &&
                        member.role !== 'admin' &&
                        member.id !== currentUserId && (
                          <Pressable
                            onPress={() => confirmRemoveProjectMember(member)}
                            style={styles.removeMemberButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${member.fullName} from project`}
                          >
                            <Feather name="user-x" size={17} color={colors.muted} />
                          </Pressable>
                        )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
        <Modal
          visible={isAddMembersOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsAddMembersOpen(false)}
        >
          <View style={styles.sheetBackdrop}>
            <Pressable
              style={styles.sheetDismissArea}
              onPress={() => setIsAddMembersOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close add members sheet"
            />
            <View style={styles.bottomSheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeading}>
                <View>
                  <Text style={styles.dialogTitle}>Add project members</Text>
                  <Text style={styles.chatSubtitle}>
                    Invitations are sent to signed-up accounts.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setIsAddMembersOpen(false)}
                  style={styles.sheetCloseButton}
                  accessibilityRole="button"
                  accessibilityLabel="Close add members sheet"
                >
                  <Feather name="x" size={18} color={colors.ink} />
                </Pressable>
              </View>
              <ScrollView
                style={styles.addMembersPicker}
                keyboardShouldPersistTaps="handled"
              >
                <AccountPicker
                  label="SEARCH ACCOUNTS"
                  query={addMemberQuery}
                  placeholder="Type a name to search"
                  suggestions={addMemberSuggestions}
                  selected={selectedProjectInvitees}
                  isSearching={isSearchingProjectUsers}
                  onQueryChange={setAddMemberQuery}
                  onSelect={(user) => {
                    setSelectedProjectInvitees((current) =>
                      current.some((selected) => selected.id === user.id)
                        ? current
                        : [...current, user]
                    );
                    setAddMemberQuery('');
                  }}
                  onRemove={(userId) =>
                    setSelectedProjectInvitees((current) =>
                      current.filter((user) => user.id !== userId)
                    )
                  }
                />
              </ScrollView>
              <View style={styles.dialogActions}>
                <Pressable
                  onPress={() => setIsAddMembersOpen(false)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void sendProjectInvitations()}
                  disabled={
                    isSendingProjectInvites || selectedProjectInvitees.length === 0
                  }
                  style={[
                    styles.submitButton,
                    (isSendingProjectInvites || selectedProjectInvitees.length === 0) &&
                      styles.submitButtonDisabled,
                  ]}
                >
                  <Text style={styles.submitButtonText}>
                    {isSendingProjectInvites ? 'Sending…' : 'Send invitations'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topBarContainer}>
        <View style={styles.topBar}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}>
              <View style={styles.brandMarkInner} />
            </View>
            <Text style={styles.brandName}>workroom</Text>
          </View>
          <View style={styles.topBarActions}>
            <Pressable
              onPress={() => setIsNotificationsOpen(true)}
              style={styles.notificationButton}
              accessibilityRole="button"
              accessibilityLabel={`${notificationCount} notifications`}
            >
              <Feather name="bell" size={19} color={colors.ink} />
              {notificationCount > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </Text>
                </View>
              )}
            </Pressable>
            <View style={styles.profileMenuAnchor}>
              <Pressable
                onPress={() => setIsProfileMenuOpen((open) => !open)}
                style={styles.profileIconButton}
                accessibilityRole="button"
                accessibilityLabel="Open profile menu"
                accessibilityState={{ expanded: isProfileMenuOpen }}
              >
                <Feather name="user" size={19} color={colors.ink} />
              </Pressable>
              {isProfileMenuOpen && (
                <View style={styles.profileDropdown}>
                  <Pressable
                    onPress={() => {
                      setIsProfileMenuOpen(false);
                      router.push('/profile');
                    }}
                    style={styles.profileMenuItem}
                    accessibilityRole="button"
                  >
                    <Feather name="user" size={15} color={colors.ink} />
                    <Text style={styles.profileMenuText}>Profile</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setIsProfileMenuOpen(false);
                      void handleLogout();
                    }}
                    style={styles.profileMenuItem}
                    accessibilityRole="button"
                  >
                    <Feather name="log-out" size={15} color={colors.ink} />
                    <Text style={styles.profileMenuText}>Log out</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
      <ScrollView
        style={styles.dashboard}
        contentContainerStyle={styles.dashboardContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'home' && <>
        <View style={styles.welcomeBlock}>
          <Text style={styles.welcomeEyebrow}>YOUR WORKSPACE</Text>
          <View style={styles.welcomeTitleRow}>
            <View style={styles.welcomeTextBlock}>
              <Text style={styles.welcomeTitle}>Good work, together.</Text>
              <Text style={styles.welcomeSubtitle}>
                A clear view of everything your team is moving forward.
              </Text>
            </View>
            <Pressable
              onPress={() => setIsCreateOpen(true)}
              style={styles.createButton}
              accessibilityRole="button"
            >
              <Text style={styles.createButtonPlus}>＋</Text>
              <Text style={styles.createButtonText}>New project</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.totalStatCard]}>
            <View style={styles.statTopLine}>
              <Text style={[styles.statLabel, styles.totalStatLabel]}>TOTAL PROJECTS</Text>
              <View style={styles.statIconDark}>
                <Text style={styles.statIconText}>▦</Text>
              </View>
            </View>
            <Text style={[styles.statNumber, styles.totalStatNumber]}>
              {projects.length.toString().padStart(2, '0')}
            </Text>
            <Text style={styles.totalStatHint}>Across your workspace</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statTopLine}>
              <Text style={styles.statLabel}>WORK IN PROGRESS</Text>
              <View style={styles.statIconLight}>
                <Text style={styles.statIconTextLight}>↗</Text>
              </View>
            </View>
            <Text style={styles.statNumber}>{inProgressCount.toString().padStart(2, '0')}</Text>
            <View style={styles.deadlineHintRow}>
              <View style={styles.deadlineDot} />
              <Text style={styles.statHint}>
                {nearingDeadlineCount} nearing deadline
              </Text>
            </View>
          </View>
        </View>
        </>}

        {(activeTab === 'home' || activeTab === 'projects') && (
        <View style={styles.projectsSection}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>
                {activeTab === 'projects' ? 'All projects' : 'Projects'}
              </Text>
              <Text style={styles.sectionSubtitle}>
                {activeTab === 'projects'
                  ? 'Browse and manage your project workspace.'
                  : 'Keep every moving piece in view.'}
              </Text>
            </View>
            <Text style={styles.projectCount}>
              {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
            </Text>
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search projects or people"
              placeholderTextColor={colors.faint}
              returnKeyType="search"
              accessibilityLabel="Search projects or people"
            />
            {!!search && (
              <Pressable
                onPress={() => setSearch('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Text style={styles.clearSearch}>×</Text>
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterList}
          >
            {(['All', 'In progress', 'On hold', 'Completed'] as FilterStatus[]).map(
              (status) => (
                <Pressable
                  key={status}
                  onPress={() => setFilter(status)}
                  style={[styles.filterChip, filter === status && styles.filterChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === status }}
                >
                  <Text
                    style={[
                      styles.filterText,
                      filter === status && styles.filterTextActive,
                    ]}
                  >
                    {status}
                  </Text>
                </Pressable>
              )
            )}
          </ScrollView>

          <View style={styles.projectList}>
            {isLoadingProjects ? (
              <View style={styles.emptyProjects}>
                <Text style={styles.emptyProjectsTitle}>Loading projects…</Text>
              </View>
            ) : filteredProjects.length === 0 ? (
              <View style={styles.emptyProjects}>
                <View style={styles.emptyProjectsMark}>
                  <Text style={styles.emptyProjectsIcon}>⌕</Text>
                </View>
                <Text style={styles.emptyProjectsTitle}>No projects here yet</Text>
                <Text style={styles.emptyProjectsText}>
                  Try another search or start a new project.
                </Text>
                <Pressable
                  onPress={() => {
                    setSearch('');
                    setFilter('All');
                  }}
                  style={styles.resetFilterButton}
                >
                  <Text style={styles.resetFilterText}>Clear filters</Text>
                </Pressable>
              </View>
            ) : (
              filteredProjects.map((project, index) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  index={index}
                  isAdmin={project.creatorId === currentUserId}
                  isMuted={!!mutedByProject[project.id]}
                  onOpen={() => openProject(project.id)}
                  onLeave={() => confirmLeaveProject(project)}
                  onToggleMute={() => toggleProjectMute(project.id)}
                />
              ))
            )}
          </View>
        </View>
        )}

        {activeTab === 'tasks' && (
          <View style={styles.workspaceSection}>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionTitle}>My tasks</Text>
                <Text style={styles.sectionSubtitle}>
                  Work assigned to your teams across every project.
                </Text>
              </View>
            </View>
            <View style={styles.taskKpiRow}>
              <View style={styles.taskKpiCard}>
                <Text style={styles.taskKpiLabel}>TOTAL TASKS</Text>
                <Text style={styles.taskKpiValue}>{myTasks.length}</Text>
              </View>
              <View style={styles.taskKpiCard}>
                <Text style={styles.taskKpiLabel}>IN PROGRESS</Text>
                <Text style={styles.taskKpiValue}>{taskInProgressCount}</Text>
              </View>
              <View style={[styles.taskKpiCard, styles.overdueKpiCard]}>
                <Text style={styles.taskKpiLabel}>OVERDUE</Text>
                <Text style={[styles.taskKpiValue, styles.overdueKpiValue]}>
                  {overdueTaskCount}
                </Text>
              </View>
            </View>
            <View style={styles.myTaskList}>
              {isLoadingProjects ? (
                <View style={styles.emptyProjects}>
                  <Text style={styles.emptyProjectsTitle}>Loading tasks…</Text>
                </View>
              ) : sortedMyTasks.length === 0 ? (
                <View style={styles.emptyProjects}>
                  <Text style={styles.emptyProjectsTitle}>No tasks assigned yet</Text>
                  <Text style={styles.emptyProjectsText}>
                    Tasks assigned to your project teams will appear here.
                  </Text>
                </View>
              ) : (
                sortedMyTasks.map((task) => (
                  <Pressable
                    key={task.id}
                    onPress={() => {
                      setSelectedMyTask(task);
                      setIsTaskDetailsOpen(true);
                    }}
                    style={styles.myTaskCard}
                    accessibilityRole="button"
                    accessibilityLabel={`Open task ${task.title}`}
                  >
                    <View style={styles.myTaskCardTop}>
                      <Text style={styles.myTaskTitle} numberOfLines={2}>
                        {task.title}
                      </Text>
                      {isTaskDueSoon(task) && (
                        <Text style={styles.priorityTag}>Priority</Text>
                      )}
                    </View>
                    <Text style={styles.myTaskProject} numberOfLines={1}>
                      {task.projectName} · {task.teamName}
                    </Text>
                    <View style={styles.myTaskCardBottom}>
                      <Text
                        style={[
                          styles.myTaskDue,
                          isTaskOverdue(task) && styles.myTaskOverdue,
                        ]}
                      >
                        Due {formatDeadline(task.deadline)}
                      </Text>
                      <Text style={styles.myTaskStatus}>
                        {task.status === 'done'
                          ? 'Done'
                          : task.status === 'needs_more_time'
                            ? 'Needs more time'
                            : 'In progress'}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        )}

        {activeTab === 'messages' && (
          <View style={styles.workspaceSection}>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionTitle}>Messages</Text>
                <Text style={styles.sectionSubtitle}>
                  Latest updates from your project chats.
                </Text>
              </View>
            </View>
            {isLoadingProjects ? (
              <View style={styles.emptyProjects}>
                <Text style={styles.emptyProjectsTitle}>Loading messages…</Text>
              </View>
            ) : conversations.length === 0 ? (
              <View style={styles.emptyProjects}>
                <Text style={styles.emptyProjectsTitle}>No project chats yet</Text>
                <Text style={styles.emptyProjectsText}>
                  Join a project to see its messages here.
                </Text>
              </View>
            ) : (
              <View style={styles.conversationList}>
                {conversations.map((conversation) => (
                  <Pressable
                    key={conversation.projectId}
                    onPress={() => openProject(conversation.projectId)}
                    style={styles.conversationCard}
                    accessibilityRole="button"
                    accessibilityLabel={`Open messages for ${conversation.projectTitle}`}
                  >
                    <View style={styles.conversationCopy}>
                      <Text style={styles.conversationPreview} numberOfLines={1}>
                        <Text style={styles.conversationProjectName}>
                          {conversation.projectTitle}
                        </Text>
                        {' · '}
                        {conversation.latestAuthorName
                          ? `${conversation.latestAuthorName}: `
                          : ''}
                        {conversation.latestMessage || 'No messages yet'}
                      </Text>
                    </View>
                    <View style={styles.conversationMeta}>
                      <Text style={styles.conversationTime}>
                        {formatConversationTime(conversation.latestMessageAt)}
                      </Text>
                      {conversation.unreadCount > 0 && (
                        <View style={styles.unreadCountBadge}>
                          <Text style={styles.unreadCountText}>
                            {conversation.unreadCount > 99
                              ? '99+'
                              : conversation.unreadCount}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === 'home' && (
          <Text style={styles.footerText}>
            A little more focus. A lot more momentum.
          </Text>
        )}
      </ScrollView>

      <WorkspaceBottomNavigation
        activeTab={activeTab}
        onSelect={navigateToTab}
        unreadMessageCount={unreadMessageCount}
      />

      <Modal
        visible={isCreateOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setIsCreateOpen(false);
          resetCreateForm();
        }}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'left', 'right', 'bottom']}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>MAKE SOMETHING HAPPEN</Text>
                <Text style={styles.modalTitle}>New project</Text>
              </View>
              <Pressable
                onPress={() => {
                  setIsCreateOpen(false);
                  resetCreateForm();
                }}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <FormField label="PROJECT TITLE">
                <TextInput
                  style={styles.formInput}
                  value={draftTitle}
                  onChangeText={setDraftTitle}
                  placeholder="e.g. Website refresh"
                  placeholderTextColor={colors.faint}
                  maxLength={80}
                  autoFocus
                />
              </FormField>
              <FormField label="DESCRIPTION">
                <TextInput
                  style={[styles.formInput, styles.descriptionInput]}
                  value={draftDescription}
                  onChangeText={setDraftDescription}
                  placeholder="What are you working on?"
                  placeholderTextColor={colors.faint}
                  multiline
                  maxLength={500}
                  textAlignVertical="top"
                />
              </FormField>
              <FormField label="DEADLINE">
                <TextInput
                  style={styles.formInput}
                  value={draftDeadline}
                  onChangeText={setDraftDeadline}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.faint}
                  autoCapitalize="none"
                  maxLength={10}
                />
              </FormField>
              <FormField label="STATUS">
                <View style={styles.statusOptions}>
                  {(['In progress', 'On hold', 'Completed'] as ProjectStatus[]).map(
                    (status) => (
                      <Pressable
                        key={status}
                        onPress={() => setDraftStatus(status)}
                        style={[
                          styles.statusOption,
                          draftStatus === status && styles.statusOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusOptionText,
                            draftStatus === status && styles.statusOptionTextActive,
                          ]}
                        >
                          {status}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>
              </FormField>
              <AccountPicker
                label="INVITE SIGNED-UP USERS"
                query={memberInput}
                placeholder="Type a name to search"
                suggestions={memberSuggestions}
                selected={selectedUsers}
                isSearching={isSearchingMembers}
                onQueryChange={setMemberInput}
                onSelect={addMember}
                onRemove={(userId) =>
                  setSelectedUsers((current) =>
                    current.filter((user) => user.id !== userId)
                  )
                }
              />
              <Text style={styles.dateNote}>
                Only existing signed-up accounts can be invited. Invitations need to be accepted before project access is granted.
              </Text>
              <Text style={styles.dateNote}>Use YYYY-MM-DD for the project deadline.</Text>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => {
                  setIsCreateOpen(false);
                  resetCreateForm();
                }}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={createProject} style={styles.submitButton}>
                <Text style={styles.submitButtonText}>Create project</Text>
                <Text style={styles.submitArrow}>→</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={isNotificationsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsNotificationsOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetDismissArea}
            onPress={() => setIsNotificationsOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close notifications"
          />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeading}>
              <View>
                <Text style={styles.dialogTitle}>Notifications</Text>
                <Text style={styles.chatSubtitle}>
                  Invitations and project updates.
                </Text>
              </View>
              <Pressable
                onPress={() => setIsNotificationsOpen(false)}
                style={styles.sheetCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Close notifications"
              >
                <Feather name="x" size={18} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView style={styles.notificationList}>
              {invitations.map((invitation) => (
                <View key={invitation.projectId} style={styles.notificationCard}>
                  <Text style={styles.notificationTitle}>{invitation.projectTitle}</Text>
                  <Text style={styles.notificationBody}>
                    {invitation.inviterName} wanted to add you to the project.
                  </Text>
                  <View style={styles.invitationActions}>
                    <Pressable
                      onPress={() => void respondToInvitation(invitation, true)}
                      style={styles.acceptButton}
                      accessibilityRole="button"
                    >
                      <Text style={styles.acceptButtonText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void respondToInvitation(invitation, false)}
                      style={styles.denyButton}
                      accessibilityRole="button"
                    >
                      <Text style={styles.denyButtonText}>Deny</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {notices.map((notice) => (
                <Pressable
                  key={notice.id}
                  onPress={() =>
                    notice.type === 'team_task_assigned'
                      ? void openTaskFromNotification(notice)
                      : void openProjectNotice(notice)
                  }
                  style={styles.notificationCard}
                  accessibilityRole="button"
                >
                  <View style={styles.notificationCardHeading}>
                    <Text style={styles.notificationTitle}>{notice.title}</Text>
                    <Text style={styles.notificationTime}>
                      {formatConversationTime(notice.createdAt)}
                    </Text>
                  </View>
                  <Text style={styles.notificationBody}>{notice.body}</Text>
                  <Text style={styles.notificationAction}>
                    {notice.type === 'team_task_assigned' ? 'Tap to view task' : 'Tap to view project'}
                  </Text>
                </Pressable>
              ))}
              {notificationCount === 0 && (
                <View style={styles.emptyProjects}>
                  <Text style={styles.emptyProjectsTitle}>You’re all caught up</Text>
                  <Text style={styles.emptyProjectsText}>
                    New project invitations and task updates will appear here.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={isTaskDetailsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsTaskDetailsOpen(false)}
      >
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialogCard}>
            <View style={styles.taskDetailsHeading}>
              <Text style={styles.dialogTitle}>Task details</Text>
              <Pressable
                onPress={() => setIsTaskDetailsOpen(false)}
                style={styles.sheetCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Close task details"
              >
                <Feather name="x" size={18} color={colors.ink} />
              </Pressable>
            </View>
            {selectedMyTask && (
              <>
                <Text style={styles.taskDetailsTitle}>{selectedMyTask.title}</Text>
                <Text style={styles.taskDetailsProject}>
                  {selectedMyTask.projectName} · {selectedMyTask.teamName}
                </Text>
                <View style={styles.taskDetailsMeta}>
                  <Text style={styles.taskDetailsLabel}>DUE DATE</Text>
                  <Text
                    style={[
                      styles.taskDetailsValue,
                      isTaskOverdue(selectedMyTask) && styles.myTaskOverdue,
                    ]}
                  >
                    {formatDeadline(selectedMyTask.deadline)}
                  </Text>
                </View>
                <View style={styles.taskDetailsMeta}>
                  <Text style={styles.taskDetailsLabel}>STATUS</Text>
                  <Text style={styles.taskDetailsValue}>
                    {selectedMyTask.status === 'done'
                      ? 'Done'
                      : selectedMyTask.status === 'needs_more_time'
                        ? 'Needs more time'
                        : 'In progress'}
                  </Text>
                </View>
                {isTaskDueSoon(selectedMyTask) && (
                  <Text style={[styles.priorityTag, styles.taskDetailsPriority]}>
                    Priority · due within 3 days
                  </Text>
                )}
              </>
            )}
            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setIsTaskDetailsOpen(false)}
                style={styles.submitButton}
              >
                <Text style={styles.submitButtonText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function WorkspaceBottomNavigation({
  activeTab,
  onSelect,
  unreadMessageCount,
}: {
  activeTab: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
  unreadMessageCount: number;
}) {
  const items: { tab: WorkspaceTab; label: string; icon: 'home' | 'folder' | 'check-square' | 'message-circle' }[] = [
    { tab: 'home', label: 'Home', icon: 'home' },
    { tab: 'projects', label: 'Projects', icon: 'folder' },
    { tab: 'tasks', label: 'My Tasks', icon: 'check-square' },
    { tab: 'messages', label: 'Messages', icon: 'message-circle' },
  ];

  return (
    <View style={styles.bottomNavigation}>
      {items.map((item) => {
        const isActive = activeTab === item.tab;
        return (
          <Pressable
            key={item.tab}
            onPress={() => onSelect(item.tab)}
            style={styles.bottomNavigationItem}
            accessibilityRole="button"
            accessibilityLabel={
              item.tab === 'messages' && unreadMessageCount > 0
                ? `${item.label}, ${unreadMessageCount} unread messages`
                : item.label
            }
            accessibilityState={{ selected: isActive }}
          >
            <View style={styles.bottomNavigationIcon}>
              <Feather
                name={item.icon}
                size={19}
                color={isActive ? colors.orange : colors.muted}
              />
              {item.tab === 'messages' && unreadMessageCount > 0 && (
                <View style={styles.messagesBadge}>
                  <Text style={styles.messagesBadgeText}>
                    {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.bottomNavigationLabel,
                isActive && styles.bottomNavigationLabelActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProjectCard({
  project,
  index,
  isAdmin,
  isMuted,
  onOpen,
  onLeave,
  onToggleMute,
}: {
  project: Project;
  index: number;
  isAdmin: boolean;
  isMuted: boolean;
  onOpen: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
}) {
  return (
    <View style={styles.projectCard}>
      <Pressable
        onPress={onOpen}
        style={styles.projectCardMain}
        accessibilityRole="button"
        accessibilityLabel={`Open ${project.title}`}
      >
        <View style={styles.projectCardHeading}>
          <View style={[styles.projectIndexMark, { backgroundColor: project.tint }]}>
            <Text style={styles.projectIndexText}>
              {String(index + 1).padStart(2, '0')}
            </Text>
          </View>
          <View style={styles.projectCardTitleBlock}>
            <Text style={styles.projectTitle} numberOfLines={1}>
              {project.title}
            </Text>
            <Text style={styles.projectDescription} numberOfLines={1}>
              {project.description}
            </Text>
          </View>
          <Text style={styles.openProjectArrow}>↗</Text>
        </View>
      </Pressable>
      <View style={styles.projectCardDivider} />
      <View style={styles.projectDetailsRow}>
        <View style={styles.projectDetail}>
          <Text style={styles.projectDetailLabel}>DEADLINE</Text>
          <Text
            style={[
              styles.projectDetailValue,
              isNearingDeadline(project) && styles.deadlineSoon,
            ]}
          >
            {formatDeadline(project.deadline)}
          </Text>
        </View>
        <View style={styles.projectDetail}>
          <Text style={styles.projectDetailLabel}>CREATED BY</Text>
          <View style={styles.creatorLine}>
            <Text style={styles.projectDetailValue} numberOfLines={1}>
              {project.creatorName}
            </Text>
            <Text style={styles.adminLabel}>Admin</Text>
          </View>
        </View>
        <View style={styles.projectDetail}>
          <Text style={styles.projectDetailLabel}>TEAM</Text>
          <View style={styles.avatarStack}>
            {project.members.slice(0, 3).map((member, memberIndex) => (
              <Avatar
                key={member.id}
                name={member.fullName}
                tint={memberIndex % 2 === 0 ? '#EEE9E2' : '#E5EAF2'}
                small
              />
            ))}
            <Text style={styles.memberCount}>{project.members.length}</Text>
          </View>
        </View>
      </View>
      <View style={styles.projectCardFooter}>
        <StatusBadge status={project.status} />
        <View style={styles.projectActions}>
          <Pressable
            onPress={onToggleMute}
            style={[styles.actionButton, isMuted && styles.actionButtonActive]}
            accessibilityRole="button"
            accessibilityLabel={isMuted ? 'Unmute project' : 'Mute project'}
          >
            {/* <Text style={[styles.actionIcon, isMuted && styles.actionTextActive]}>
              {isMuted ? 'volume-x' : 'volume-2'}
            </Text> */}
            <Feather
              name={isMuted ? 'volume-x' : 'volume-2'}
              size={20}
              color={isMuted ? '#000000' : '#666666'}
            />
            <Text style={[styles.actionText, isMuted && styles.actionTextActive]}>
              {isMuted ? 'Muted' : 'Mute'}
            </Text>
          </Pressable>
          {!isAdmin && (
            <>
              <View style={styles.actionSeparator} />
              <Pressable
                onPress={onLeave}
                style={styles.actionButton}
                accessibilityRole="button"
                accessibilityLabel="Leave project"
              >
                <Text style={styles.actionIcon}>↗</Text>
                <Text style={styles.actionText}>Leave</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const badgeStyle =
    status === 'In progress'
      ? styles.progressBadge
      : status === 'Completed'
        ? styles.completedBadge
        : styles.holdBadge;
  const dotStyle =
    status === 'In progress'
      ? styles.progressDot
      : status === 'Completed'
        ? styles.completedDot
        : styles.holdDot;
  return (
    <View style={[styles.statusBadge, badgeStyle]}>
      <View style={[styles.statusDot, dotStyle]} />
      <Text style={styles.statusBadgeText}>{status}</Text>
    </View>
  );
}

function Avatar({
  name,
  tint,
  small = false,
}: {
  name: string;
  tint: string;
  small?: boolean;
}) {
  return (
    <View
      style={[
        styles.avatar,
        small && styles.avatarSmall,
        { backgroundColor: tint },
      ]}
      accessibilityLabel={name}
    >
      <Text style={[styles.avatarText, small && styles.avatarTextSmall]}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      {children}
    </View>
  );
}

function fileExtension(name: string) {
  const extension = name.split('.').pop()?.trim().toUpperCase();
  return extension && extension.length <= 5 ? extension : 'FILE';
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  dashboard: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  dashboardContent: {
    width: '100%',
    maxWidth: 1020,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 36,
  },
  topBarContainer: {
    width: '100%',
    maxWidth: 1020,
    alignSelf: 'center',
    zIndex: 10,
    elevation: 10,
    paddingHorizontal: 24,
    backgroundColor: colors.white,
  },
  topBar: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  bottomNavigation: {
    height: 63,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
  },
  bottomNavigationItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bottomNavigationIcon: {
    position: 'relative',
  },
  messagesBadge: {
    position: 'absolute',
    top: -7,
    right: -11,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.orange,
  },
  messagesBadgeText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: '700',
  },
  bottomNavigationLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '600',
  },
  bottomNavigationLabelActive: {
    color: colors.orange,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkInner: {
    width: 9,
    height: 9,
    borderRadius: 3,
    backgroundColor: colors.white,
    transform: [{ rotate: '45deg' }],
  },
  brandName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  notificationButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#F3F3F2',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -5,
    minWidth: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.orange,
  },
  notificationBadgeText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: '700',
  },
  profileMenuAnchor: {
    position: 'relative',
    zIndex: 5,
  },
  profileIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8E5E0',
  },
  profileDropdown: {
    position: 'absolute',
    top: 43,
    right: 0,
    width: 146,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  profileMenuItem: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
  },
  profileMenuText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '500',
  },
  welcomeBlock: {
    paddingTop: 33,
    paddingBottom: 25,
  },
  welcomeEyebrow: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 11,
  },
  welcomeTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
  welcomeTextBlock: {
    flex: 1,
  },
  welcomeTitle: {
    color: colors.ink,
    fontSize: 31,
    fontWeight: '700',
    letterSpacing: -1.2,
    lineHeight: 38,
  },
  welcomeSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    maxWidth: 410,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 43,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: colors.black,
  },
  submitButtonDisabled: {
    backgroundColor: '#A8A9AB',
  },
  createButtonPlus: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 23,
  },
  createButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 13,
  },
  statCard: {
    flex: 1,
    minHeight: 137,
    padding: 17,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  totalStatCard: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  statTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  totalStatLabel: {
    color: '#B8B8B8',
  },
  statIconDark: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333333',
  },
  statIconLight: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F1',
  },
  statIconText: {
    color: '#EDEDED',
    fontSize: 12,
  },
  statIconTextLight: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  statNumber: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: '600',
    letterSpacing: -1.4,
    marginTop: 9,
  },
  totalStatNumber: {
    color: colors.white,
  },
  totalStatHint: {
    color: '#A4A4A4',
    fontSize: 11,
    marginTop: 1,
  },
  deadlineHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  deadlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D49444',
  },
  statHint: {
    color: colors.muted,
    fontSize: 11,
  },
  projectsSection: {
    paddingTop: 34,
  },
  workspaceSection: {
    paddingTop: 28,
    paddingBottom: 8,
  },
  taskKpiRow: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 18,
  },
  taskKpiCard: {
    flex: 1,
    minHeight: 83,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  overdueKpiCard: {
    borderColor: '#F1D5C5',
    backgroundColor: '#FFF8F3',
  },
  taskKpiLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  taskKpiValue: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 5,
  },
  overdueKpiValue: {
    color: colors.orange,
  },
  myTaskList: {
    gap: 9,
  },
  myTaskCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  myTaskCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  myTaskTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  priorityTag: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFF0E6',
    color: colors.orange,
    fontSize: 8,
    fontWeight: '700',
  },
  myTaskProject: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 6,
  },
  myTaskCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 11,
  },
  myTaskDue: {
    color: colors.muted,
    fontSize: 9,
  },
  myTaskOverdue: {
    color: '#B54724',
    fontWeight: '700',
  },
  myTaskStatus: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '600',
  },
  conversationList: {
    gap: 8,
  },
  conversationCard: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  conversationCopy: {
    flex: 1,
    minWidth: 0,
  },
  conversationPreview: {
    color: colors.muted,
    fontSize: 10,
  },
  conversationProjectName: {
    color: colors.ink,
    fontWeight: '700',
  },
  conversationMeta: {
    alignItems: 'flex-end',
    gap: 5,
  },
  conversationTime: {
    color: colors.faint,
    fontSize: 8,
  },
  unreadCountBadge: {
    minWidth: 19,
    height: 19,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.orange,
  },
  unreadCountText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: '700',
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  projectCount: {
    color: colors.muted,
    fontSize: 11,
    paddingBottom: 2,
  },
  searchBox: {
    height: 43,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    backgroundColor: colors.white,
  },
  searchIcon: {
    color: colors.muted,
    fontSize: 22,
    lineHeight: 26,
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    paddingVertical: 0,
  },
  clearSearch: {
    color: colors.muted,
    fontSize: 21,
    paddingHorizontal: 2,
  },
  filterList: {
    flexDirection: 'row',
    gap: 7,
    paddingVertical: 13,
  },
  filterChip: {
    height: 31,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 7,
    backgroundColor: colors.white,
  },
  filterChipActive: {
    borderColor: colors.black,
    backgroundColor: colors.black,
  },
  filterText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  filterTextActive: {
    color: colors.white,
  },
  projectList: {
    gap: 10,
  },
  projectCard: {
    padding: 15,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  projectCardMain: {
    paddingBottom: 13,
  },
  projectCardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  projectIndexMark: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectIndexText: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '700',
  },
  projectCardTitleBlock: {
    flex: 1,
  },
  projectTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.15,
  },
  projectDescription: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  openProjectArrow: {
    color: colors.muted,
    fontSize: 16,
    paddingHorizontal: 2,
  },
  projectCardDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  projectDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 6,
  },
  projectDetail: {
    // flex: 1,
    minWidth: 0,
  },
  projectDetailLabel: {
    color: colors.faint,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  projectDetailValue: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '600',
  },
  deadlineSoon: {
    color: colors.amber,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmall: {
    width: 21,
    height: 21,
    borderWidth: 1,
    borderColor: colors.white,
    marginRight: -5,
  },
  avatarText: {
    color: '#454545',
    fontSize: 10,
    fontWeight: '700',
  },
  avatarTextSmall: {
    fontSize: 7,
  },
  memberCount: {
    color: colors.muted,
    fontSize: 9,
    marginLeft: 10,
  },
  projectCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 11,
  },
  statusBadge: {
    minHeight: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  progressBadge: {
    backgroundColor: colors.greenBg,
  },
  completedBadge: {
    backgroundColor: '#F0F0F0',
  },
  holdBadge: {
    backgroundColor: colors.amberBg,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  progressDot: {
    backgroundColor: colors.green,
  },
  completedDot: {
    backgroundColor: '#7A7A7A',
  },
  holdDot: {
    backgroundColor: colors.amber,
  },
  statusBadgeText: {
    color: colors.ink,
    fontSize: 9,
    fontWeight: '600',
  },
  projectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  actionButtonActive: {
    opacity: 0.85,
  },
  actionIcon: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  actionText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  actionTextActive: {
    color: colors.ink,
  },
  actionSeparator: {
    width: 1,
    height: 13,
    backgroundColor: colors.line,
  },
  emptyProjects: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  emptyProjectsMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F1F0',
  },
  emptyProjectsIcon: {
    color: colors.muted,
    fontSize: 24,
  },
  emptyProjectsTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyProjectsText: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 5,
    textAlign: 'center',
  },
  resetFilterButton: {
    marginTop: 13,
    padding: 7,
  },
  resetFilterText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '600',
  },
  footerText: {
    color: colors.faint,
    fontSize: 10,
    textAlign: 'center',
    paddingTop: 20,
  },
  detailScreen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  detailHeader: {
    position: 'relative',
    zIndex: 5,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 19,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F3F2',
  },
  backArrow: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 29,
    marginTop: -3,
  },
  detailHeaderText: {
    flex: 1,
  },
  detailEyebrow: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  detailHeaderTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F3F2',
  },
  projectActionsDismiss: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 4,
  },
  projectActionsAnchor: {
    position: 'relative',
    zIndex: 10,
  },
  projectActionsDropdown: {
    position: 'absolute',
    top: 42,
    right: 0,
    width: 182,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  projectActionItem: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  projectActionText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '500',
  },
  deleteProjectActionText: {
    color: '#C64F3D',
    fontSize: 11,
    fontWeight: '600',
  },
  detailScroll: {
    flex: 1,
  },
  detailScrollContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 24,
  },
  detailSectionTabs: {
    flexDirection: 'row',
    marginTop: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  detailSectionTab: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  detailSectionTabActive: {
    borderBottomColor: colors.orange,
  },
  detailSectionTabLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  detailSectionTabLabelActive: {
    color: colors.orange,
  },
  projectSummaryCard: {
    padding: 17,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  summaryTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailDueText: {
    color: colors.muted,
    fontSize: 10,
  },
  summaryTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.6,
    marginTop: 14,
  },
  summaryDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 15,
  },
  summaryMetaRow: {
    flexDirection: 'row',
    gap: 38,
  },
  metaLabel: {
    color: colors.faint,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginBottom: 7,
  },
  metaValue: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '600',
  },
  detailMemberMeta: {
    flex: 1,
  },
  chatHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 25,
    paddingBottom: 15,
  },
  chatTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  chatSubtitle: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 4,
  },
  chatCount: {
    color: colors.muted,
    fontSize: 9,
    paddingBottom: 2,
  },
  emptyChat: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 11,
    backgroundColor: colors.white,
  },
  emptyChatTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyChatText: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 5,
  },
  messageRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 11,
  },
  messageAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEE9E2',
  },
  messageAvatarYou: {
    backgroundColor: '#E6EAF1',
  },
  messageAvatarText: {
    color: '#484848',
    fontSize: 8,
    fontWeight: '700',
  },
  messageContent: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 11,
    backgroundColor: colors.white,
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  messageAuthor: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '700',
  },
  messageTime: {
    color: colors.faint,
    fontSize: 9,
  },
  messageText: {
    color: '#505258',
    fontSize: 11,
    lineHeight: 17,
  },
  messageAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 48,
    marginTop: 9,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: '#FAFAF9',
  },
  fileIcon: {
    width: 30,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#F0EFEC',
  },
  fileIconText: {
    color: colors.ink,
    fontSize: 7,
    fontWeight: '700',
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    color: colors.ink,
    fontSize: 9,
    fontWeight: '600',
  },
  fileSize: {
    color: colors.muted,
    fontSize: 8,
    marginTop: 3,
  },
  fileCheck: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '700',
  },
  composerArea: {
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: Platform.OS === 'web' ? 12 : 7,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
  },
  composer: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: '#FCFCFB',
  },
  attachButton: {
    width: 30,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachButtonText: {
    color: colors.muted,
    fontSize: 22,
    lineHeight: 26,
  },
  messageInput: {
    flex: 1,
    maxHeight: 100,
    color: colors.ink,
    fontSize: 12,
    paddingVertical: 9,
  },
  sendButton: {
    width: 31,
    height: 31,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
  },
  sendButtonDisabled: {
    backgroundColor: '#D8D8D8',
  },
  sendButtonText: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
  },
  fileHint: {
    color: colors.faint,
    fontSize: 8,
    marginTop: 6,
    marginLeft: 4,
  },
  pendingFile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: '#F1F1F0',
  },
  pendingFileText: {
    flex: 1,
    color: colors.ink,
    fontSize: 10,
  },
  removeFile: {
    color: colors.muted,
    fontSize: 17,
    paddingHorizontal: 3,
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  modalKeyboard: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalEyebrow: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.6,
    marginTop: 4,
  },
  closeButton: {
    width: 33,
    height: 33,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F1',
  },
  closeButtonText: {
    color: colors.muted,
    fontSize: 23,
    lineHeight: 25,
  },
  modalScroll: {
    flex: 1,
  },
  formContent: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 21,
    paddingBottom: 24,
  },
  formField: {
    marginBottom: 19,
  },
  formLabel: {
    color: '#54565A',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginBottom: 8,
  },
  formInput: {
    minHeight: 45,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E6E7',
    borderRadius: 8,
    color: colors.ink,
    fontSize: 12,
    backgroundColor: colors.white,
  },
  descriptionInput: {
    minHeight: 86,
    paddingTop: 12,
  },
  statusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  statusOption: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 7,
    backgroundColor: colors.white,
  },
  statusOptionActive: {
    borderColor: colors.black,
    backgroundColor: colors.black,
  },
  statusOptionText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  statusOptionTextActive: {
    color: colors.white,
  },
  addMemberRow: {
    flexDirection: 'row',
    gap: 8,
  },
  memberInput: {
    flex: 1,
  },
  addMemberButton: {
    minWidth: 57,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: '#F7F7F6',
  },
  addMemberButtonText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '600',
  },
  memberChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 9,
    paddingRight: 5,
    minHeight: 27,
    borderRadius: 6,
    backgroundColor: '#F1F1F0',
  },
  memberChipText: {
    color: colors.ink,
    fontSize: 9,
  },
  memberChipRemove: {
    color: colors.muted,
    fontSize: 15,
    paddingHorizontal: 3,
  },
  dateNote: {
    color: colors.faint,
    fontSize: 9,
    marginTop: -7,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
  },
  cancelButton: {
    minHeight: 45,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 8,
    backgroundColor: colors.black,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
  submitArrow: {
    color: colors.white,
    fontSize: 15,
  },
  inboxSection: {
    marginBottom: 18,
    gap: 8,
  },
  invitationCard: {
    padding: 13,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  invitationCopy: {
    gap: 4,
  },
  invitationTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  invitationText: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
  },
  invitationActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  acceptButton: {
    minWidth: 75,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: colors.black,
  },
  acceptButtonText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  denyButton: {
    minWidth: 75,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 7,
  },
  denyButtonText: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '600',
  },
  noticeCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    backgroundColor: colors.white,
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '700',
  },
  noticeText: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  creatorLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adminLabel: {
    color: '#C45A12',
    fontSize: 10,
    fontWeight: '700',
  },
  memberNames: {
    gap: 3,
    marginTop: 8,
  },
  memberName: {
    color: colors.muted,
    fontSize: 9,
  },
  teamsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 24,
    paddingBottom: 12,
  },
  smallActionButton: {
    minHeight: 31,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: colors.black,
  },
  smallActionText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '700',
  },
  noTeamsText: {
    color: colors.muted,
    fontSize: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    backgroundColor: colors.white,
  },
  teamCard: {
    padding: 12,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: '#FAFAF9',
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamHeaderText: {
    flex: 1,
  },
  teamActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  deleteTeamButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#FCE9E7',
  },
  teamName: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  teamMemberNames: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 4,
  },
  teamMemberList: {
    marginTop: 4,
  },
  teamMemberRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  removeTeamMemberButton: {
    width: 30,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noTasksText: {
    color: colors.faint,
    fontSize: 9,
    marginTop: 10,
  },
  chatTools: {
    alignItems: 'flex-end',
    gap: 6,
  },
  mediaButton: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
  },
  mediaButtonActive: {
    borderColor: colors.black,
    backgroundColor: colors.black,
  },
  mediaButtonText: {
    color: colors.ink,
    fontSize: 9,
    fontWeight: '600',
  },
  mediaButtonTextActive: {
    color: colors.white,
  },
  messageDateRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  messageDate: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#ECEDEF',
  },
  systemMessage: {
    alignSelf: 'center',
    maxWidth: '90%',
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EEECE8',
  },
  systemMessageText: {
    color: '#676767',
    fontSize: 9,
    textAlign: 'center',
    lineHeight: 14,
  },
  dialogBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  sheetDismissArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  bottomSheet: {
    maxHeight: '82%',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: colors.white,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    marginBottom: 14,
    borderRadius: 2,
    backgroundColor: '#D5D5D2',
  },
  sheetHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetCloseButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F3F3F2',
  },
  notificationList: {
    maxHeight: 470,
  },
  notificationCard: {
    padding: 13,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    backgroundColor: colors.white,
  },
  notificationCardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notificationTitle: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  notificationBody: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },
  notificationTime: {
    color: colors.faint,
    fontSize: 8,
  },
  notificationAction: {
    color: colors.orange,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 8,
  },
  taskDetailsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskDetailsTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 8,
  },
  taskDetailsProject: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 5,
  },
  taskDetailsMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  taskDetailsLabel: {
    color: colors.faint,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  taskDetailsValue: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '600',
  },
  taskDetailsPriority: {
    alignSelf: 'flex-start',
    marginTop: 13,
  },
  sheetMemberList: {
    maxHeight: 410,
  },
  memberListRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  memberListCopy: {
    flex: 1,
  },
  memberListName: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '600',
  },
  memberListRole: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 3,
  },
  removeMemberButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMembersPicker: {
    maxHeight: 350,
    marginBottom: 13,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    padding: 20,
    borderRadius: 14,
    backgroundColor: colors.white,
  },
  dialogTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 6,
  },
  memberChoiceList: {
    maxHeight: 220,
    marginBottom: 16,
  },
  teamMemberChoice: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  teamMemberSelect: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamMemberCheckbox: {
    color: colors.ink,
    fontSize: 15,
  },
  teamMemberChoiceName: {
    color: colors.ink,
    fontSize: 10,
  },
  leaderToggle: {
    paddingVertical: 8,
    paddingHorizontal: 5,
  },
  leaderToggleText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '600',
  },
  leaderActive: {
    color: '#C45A12',
  },
});
