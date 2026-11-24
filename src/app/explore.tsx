import { useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
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

type ProjectStatus = 'In progress' | 'Completed' | 'On hold';
type FilterStatus = 'All' | ProjectStatus;

type Project = {
  id: string;
  title: string;
  description: string;
  deadline: string;
  creator: string;
  members: string[];
  status: ProjectStatus;
  tint: string;
};

type Attachment = {
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
};

type ChatMessage = {
  id: string;
  author: string;
  initials: string;
  time: string;
  text: string;
  attachment?: Attachment;
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
};

const dateAfter = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const initialProjects: Project[] = [
  {
    id: 'p-1',
    title: 'Brand refresh',
    description: 'A new visual identity for the next chapter.',
    deadline: dateAfter(3),
    creator: 'Maya Chen',
    members: ['Maya Chen', 'Jordan Lee', 'Alex Morgan'],
    status: 'In progress',
    tint: '#F0E8DE',
  },
  {
    id: 'p-2',
    title: 'Q4 launch campaign',
    description: 'Coordinating the launch across every channel.',
    deadline: dateAfter(6),
    creator: 'Jordan Lee',
    members: ['Jordan Lee', 'Riley Park', 'Sam Rivera', 'Maya Chen'],
    status: 'In progress',
    tint: '#E8EAF4',
  },
  {
    id: 'p-3',
    title: 'Mobile app redesign',
    description: 'A simpler, more thoughtful product experience.',
    deadline: dateAfter(15),
    creator: 'Sam Rivera',
    members: ['Sam Rivera', 'Alex Morgan'],
    status: 'On hold',
    tint: '#E6EFEA',
  },
  {
    id: 'p-4',
    title: 'Customer research',
    description: 'Turning customer conversations into clear next steps.',
    deadline: dateAfter(-4),
    creator: 'Alex Morgan',
    members: ['Alex Morgan', 'Maya Chen', 'Jordan Lee'],
    status: 'Completed',
    tint: '#F2E7EB',
  },
];

const sampleMessages: ChatMessage[] = [
  {
    id: 'm-1',
    author: 'Maya Chen',
    initials: 'MC',
    time: '10:24 AM',
    text: 'I’ve added the latest direction here. What do you think of the updated type pairing?',
  },
  {
    id: 'm-2',
    author: 'Jordan Lee',
    initials: 'JL',
    time: '10:31 AM',
    text: 'Looks great — the contrast feels much clearer. I’ll share it with the team.',
  },
];

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

export default function TabTwoScreen() {
  const [projects, setProjects] = useState(initialProjects);
  const [filter, setFilter] = useState<FilterStatus>('All');
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [joinedByProject, setJoinedByProject] = useState<Record<string, boolean>>({});
  const [mutedByProject, setMutedByProject] = useState<Record<string, boolean>>({});
  const [members, setMembers] = useState<string[]>([]);
  const [memberInput, setMemberInput] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftDeadline, setDraftDeadline] = useState('');
  const [draftStatus, setDraftStatus] = useState<ProjectStatus>('In progress');
  const [messageDraft, setMessageDraft] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);
  const [messagesByProject, setMessagesByProject] = useState<
    Record<string, ChatMessage[]>
  >({ 'p-1': sampleMessages });

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesFilter = filter === 'All' || project.status === filter;
      const matchesSearch =
        !query ||
        project.title.toLowerCase().includes(query) ||
        project.creator.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [filter, projects, search]);

  const inProgressCount = projects.filter(
    (project) => project.status === 'In progress'
  ).length;
  const nearingDeadlineCount = projects.filter(isNearingDeadline).length;

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
    setMembers([]);
    setMemberInput('');
  };

  const addMember = () => {
    const name = memberInput.trim();
    if (!name || members.some((member) => member.toLowerCase() === name.toLowerCase())) {
      return;
    }
    setMembers((current) => [...current, name]);
    setMemberInput('');
  };

  const createProject = () => {
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
    const projectMembers = [...members];
    if (
      memberInput.trim() &&
      !projectMembers.some(
        (member) => member.toLowerCase() === memberInput.trim().toLowerCase()
      )
    ) {
      projectMembers.push(memberInput.trim());
    }

    const project: Project = {
      id: `p-${Date.now()}`,
      title,
      description: draftDescription.trim(),
      deadline: draftDeadline,
      creator: 'You',
      members: ['You', ...projectMembers],
      status: draftStatus,
      tint: '#EAE8F1',
    };
    setProjects((current) => [project, ...current]);
    setJoinedByProject((current) => ({ ...current, [project.id]: true }));
    setIsCreateOpen(false);
    setFilter('All');
    setSearch('');
    resetCreateForm();
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

  const sendMessage = () => {
    if (!activeProject || (!messageDraft.trim() && !pendingAttachment)) return;
    const message: ChatMessage = {
      id: `m-${Date.now()}`,
      author: 'You',
      initials: 'YO',
      time: new Date().toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }),
      text: messageDraft.trim(),
      attachment: pendingAttachment ?? undefined,
    };
    setMessagesByProject((current) => ({
      ...current,
      [activeProject.id]: [...(current[activeProject.id] ?? []), message],
    }));
    setMessageDraft('');
    setPendingAttachment(null);
  };

  const toggleProjectMembership = (projectId: string) => {
    setJoinedByProject((current) => ({
      ...current,
      [projectId]: current[projectId] === false,
    }));
  };

  const toggleProjectMute = (projectId: string) => {
    setMutedByProject((current) => ({
      ...current,
      [projectId]: !current[projectId],
    }));
  };

  const openProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setMessageDraft('');
    setPendingAttachment(null);
  };

  if (activeProject) {
    const messages = messagesByProject[activeProject.id] ?? [];
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.detailScreen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={styles.detailHeader}>
            <Pressable
              onPress={() => setActiveProjectId(null)}
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
            <Pressable
              onPress={() => toggleProjectMute(activeProject.id)}
              style={styles.headerIconButton}
              accessibilityRole="button"
              accessibilityLabel={mutedByProject[activeProject.id] ? 'Unmute project' : 'Mute project'}
            >
              <Text style={styles.headerIconText}>
                {mutedByProject[activeProject.id] ? '◖' : '◗'}
              </Text>
            </Pressable>
          </View>

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
                  <Text style={styles.metaValue}>{activeProject.creator}</Text>
                </View>
                <View style={styles.detailMemberMeta}>
                  <Text style={styles.metaLabel}>TEAM</Text>
                  <View style={styles.avatarStack}>
                    {activeProject.members.slice(0, 4).map((member, index) => (
                      <Avatar
                        key={`${member}-${index}`}
                        name={member}
                        tint={index % 2 === 0 ? '#EEE9E2' : '#E5EAF2'}
                        small
                      />
                    ))}
                    <Text style={styles.memberCount}>
                      {activeProject.members.length} members
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.chatHeading}>
              <View>
                <Text style={styles.chatTitle}>Team chat</Text>
                <Text style={styles.chatSubtitle}>The conversation, all in one place.</Text>
              </View>
              <Text style={styles.chatCount}>{messages.length} messages</Text>
            </View>

            {messages.length === 0 ? (
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatTitle}>Start the conversation</Text>
                <Text style={styles.emptyChatText}>
                  Share an update or ask your team a question.
                </Text>
              </View>
            ) : (
              messages.map((message) => (
                <View key={message.id} style={styles.messageRow}>
                  <View
                    style={[
                      styles.messageAvatar,
                      message.author === 'You' && styles.messageAvatarYou,
                    ]}
                  >
                    <Text style={styles.messageAvatarText}>{message.initials}</Text>
                  </View>
                  <View style={styles.messageContent}>
                    <View style={styles.messageMeta}>
                      <Text style={styles.messageAuthor}>{message.author}</Text>
                      <Text style={styles.messageTime}>{message.time}</Text>
                    </View>
                    {!!message.text && (
                      <Text style={styles.messageText}>{message.text}</Text>
                    )}
                    {message.attachment && (
                      <View style={styles.messageAttachment}>
                        <View style={styles.fileIcon}>
                          <Text style={styles.fileIconText}>
                            {fileExtension(message.attachment.name)}
                          </Text>
                        </View>
                        <View style={styles.fileDetails}>
                          <Text style={styles.fileName} numberOfLines={1}>
                            {message.attachment.name}
                          </Text>
                          <Text style={styles.fileSize}>
                            {formatFileSize(message.attachment.size) || 'Attached file'}
                          </Text>
                        </View>
                        <Text style={styles.fileCheck}>✓</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </ScrollView>

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
                disabled={!messageDraft.trim() && !pendingAttachment}
                style={[
                  styles.sendButton,
                  !messageDraft.trim() && !pendingAttachment && styles.sendButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                <Text style={styles.sendButtonText}>↑</Text>
              </Pressable>
            </View>
            <Text style={styles.fileHint}>Attach screenshots, PDF, Excel or Word files</Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.dashboard}
        contentContainerStyle={styles.dashboardContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}>
              <View style={styles.brandMarkInner} />
            </View>
            <Text style={styles.brandName}>workroom</Text>
          </View>
          <View style={styles.topBarActions}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>YO</Text>
            </View>
            <Pressable
              onPress={handleLogout}
              style={styles.logoutButton}
              accessibilityRole="button"
            >
              <Text style={styles.logoutText}>Log out</Text>
            </Pressable>
          </View>
        </View>

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

        <View style={styles.projectsSection}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Projects</Text>
              <Text style={styles.sectionSubtitle}>
                Keep every moving piece in view.
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
            {filteredProjects.length === 0 ? (
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
                  isJoined={joinedByProject[project.id] !== false}
                  isMuted={!!mutedByProject[project.id]}
                  onOpen={() => openProject(project.id)}
                  onToggleMembership={() => toggleProjectMembership(project.id)}
                  onToggleMute={() => toggleProjectMute(project.id)}
                />
              ))
            )}
          </View>
        </View>

        <Text style={styles.footerText}>A little more focus. A lot more momentum.</Text>
      </ScrollView>

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
              <FormField label="ADD TEAM MEMBERS">
                <View style={styles.addMemberRow}>
                  <TextInput
                    style={[styles.formInput, styles.memberInput]}
                    value={memberInput}
                    onChangeText={setMemberInput}
                    placeholder="Name or email"
                    placeholderTextColor={colors.faint}
                    onSubmitEditing={addMember}
                    returnKeyType="done"
                  />
                  <Pressable onPress={addMember} style={styles.addMemberButton}>
                    <Text style={styles.addMemberButtonText}>Add</Text>
                  </Pressable>
                </View>
                {members.length > 0 && (
                  <View style={styles.memberChips}>
                    {members.map((member) => (
                      <View key={member} style={styles.memberChip}>
                        <Text style={styles.memberChipText}>{member}</Text>
                        <Pressable
                          onPress={() =>
                            setMembers((current) =>
                              current.filter((value) => value !== member)
                            )
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${member}`}
                        >
                          <Text style={styles.memberChipRemove}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </FormField>
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
    </SafeAreaView>
  );
}

function ProjectCard({
  project,
  index,
  isJoined,
  isMuted,
  onOpen,
  onToggleMembership,
  onToggleMute,
}: {
  project: Project;
  index: number;
  isJoined: boolean;
  isMuted: boolean;
  onOpen: () => void;
  onToggleMembership: () => void;
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
          <Text style={styles.projectDetailValue} numberOfLines={1}>
            {project.creator}
          </Text>
        </View>
        <View style={styles.projectDetail}>
          <Text style={styles.projectDetailLabel}>TEAM</Text>
          <View style={styles.avatarStack}>
            {project.members.slice(0, 3).map((member, memberIndex) => (
              <Avatar
                key={`${member}-${memberIndex}`}
                name={member}
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
            <Text style={[styles.actionIcon, isMuted && styles.actionTextActive]}>
              {isMuted ? '◖' : '◗'}
            </Text>
            <Text style={[styles.actionText, isMuted && styles.actionTextActive]}>
              {isMuted ? 'Muted' : 'Mute'}
            </Text>
          </Pressable>
          <View style={styles.actionSeparator} />
          <Pressable
            onPress={onToggleMembership}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={isJoined ? 'Leave project' : 'Join project'}
          >
            <Text style={[styles.actionIcon, !isJoined && styles.actionTextActive]}>
              {isJoined ? '↗' : '+'}
            </Text>
            <Text style={[styles.actionText, !isJoined && styles.actionTextActive]}>
              {isJoined ? 'Leave' : 'Join'}
            </Text>
          </Pressable>
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
  topBar: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
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
  userAvatar: {
    width: 33,
    height: 33,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8E5E0',
  },
  userAvatarText: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '700',
  },
  logoutButton: {
    paddingVertical: 8,
    paddingLeft: 2,
  },
  logoutText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
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
    flex: 1,
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
  headerIconText: {
    color: colors.ink,
    fontSize: 17,
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
});
