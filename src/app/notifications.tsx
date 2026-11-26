import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import {
  getProfilePreferences,
  updateProfileNotificationPreferences,
  type ProfilePreferences,
} from '../features/profile/api';

type PreferenceKey =
  | 'projectInvitationsEnabled'
  | 'taskAssignmentsEnabled';

export default function NotificationPreferencesScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<
    Pick<
      ProfilePreferences,
      'projectInvitationsEnabled' | 'taskAssignmentsEnabled'
    >
  >({
    projectInvitationsEnabled: true,
    taskAssignmentsEnabled: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const loadPreferences = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data.user) {
          router.replace('/');
          return;
        }
        const profile = await getProfilePreferences(data.user.id);
        if (!active) return;
        setUserId(data.user.id);
        setPreferences({
          projectInvitationsEnabled: profile.projectInvitationsEnabled,
          taskAssignmentsEnabled: profile.taskAssignmentsEnabled,
        });
      } catch (error) {
        console.error('Unable to load notification preferences:', error);
        Alert.alert(
          'Unable to load preferences',
          error instanceof Error ? error.message : 'Please try again.'
        );
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadPreferences();
    return () => {
      active = false;
    };
  }, []);

  const updatePreference = async (key: PreferenceKey, value: boolean) => {
    if (!userId || isSaving) return;
    const previous = preferences;
    const next = { ...previous, [key]: value };
    setPreferences(next);
    setIsSaving(true);
    try {
      await updateProfileNotificationPreferences(userId, next);
    } catch (error) {
      setPreferences(previous);
      console.error('Unable to save notification preferences:', error);
      Alert.alert(
        'Unable to save preference',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={21} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#D76A24" />
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.description}>
            Choose the project updates you want to be notified about.
          </Text>
          <View style={styles.preferencesCard}>
            <PreferenceRow
              title="Project invitations"
              subtitle="When someone adds you to a project"
              value={preferences.projectInvitationsEnabled}
              disabled={isSaving}
              onChange={(value) =>
                void updatePreference('projectInvitationsEnabled', value)
              }
            />
            <View style={styles.divider} />
            <PreferenceRow
              title="Task assignments"
              subtitle="When a team leader assigns you a task"
              value={preferences.taskAssignmentsEnabled}
              disabled={isSaving}
              onChange={(value) =>
                void updatePreference('taskAssignmentsEnabled', value)
              }
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function PreferenceRow({
  title,
  subtitle,
  value,
  disabled,
  onChange,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceCopy}>
        <Text style={styles.preferenceTitle}>{title}</Text>
        <Text style={styles.preferenceSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: '#D7D8DA', true: '#F0B08D' }}
        thumbColor={value ? '#D76A24' : '#FFFFFF'}
        accessibilityLabel={title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F6',
  },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEDEF',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#202124',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 36,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 26,
  },
  description: {
    marginBottom: 16,
    color: '#777A80',
    fontSize: 14,
    lineHeight: 21,
  },
  preferencesCard: {
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  preferenceRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  preferenceCopy: {
    flex: 1,
  },
  preferenceTitle: {
    color: '#202124',
    fontSize: 14,
    fontWeight: '600',
  },
  preferenceSubtitle: {
    marginTop: 5,
    color: '#777A80',
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#ECEDEF',
  },
});
