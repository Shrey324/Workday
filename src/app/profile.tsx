import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { ProfilePhotoField } from '../components/profile/ProfilePhotoField';
import {
  getProfilePreferences,
  type ProfilePreferences,
} from '../features/profile/api';

export default function ProfileScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<ProfilePreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data.user) {
          router.replace('/');
          return;
        }

        const nextProfile = await getProfilePreferences(data.user.id);
        if (!active) return;
        setUserId(data.user.id);
        setEmail(data.user.email ?? '');
        setProfile(nextProfile);
      } catch (error) {
        console.error('Unable to load the profile:', error);
        Alert.alert(
          'Unable to load profile',
          error instanceof Error ? error.message : 'Please try again.'
        );
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

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
      Alert.alert('Logout failed', 'Unable to log out. Please try again.');
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
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#D76A24" />
        </View>
      ) : profile && userId ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.identity}>
            <ProfilePhotoField
              userId={userId}
              avatarUrl={profile.avatarUrl}
              fullName={profile.fullName}
              onPhotoSaved={(avatarUrl) =>
                setProfile((current) =>
                  current ? { ...current, avatarUrl } : current
                )
              }
            />
            <Text style={styles.name}>{profile.fullName}</Text>
            <Text style={styles.email}>{email}</Text>
          </View>

          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.accountCard}>
            <AccountRow
              icon="user"
              title="Personal information"
              subtitle="Update your name and profile photo"
              onPress={() => router.push('/personal-information')}
            />
            <View style={styles.divider} />
            <AccountRow
              icon="lock"
              title="Change password"
              subtitle="Update your account password"
              onPress={() => router.push('/change-password')}
            />
            <View style={styles.divider} />
            <AccountRow
              icon="bell"
              title="Notifications"
              subtitle="Choose which updates to receive"
              onPress={() => router.push('/notifications')}
            />
          </View>

          <Pressable
            onPress={() => void handleLogout()}
            style={styles.logoutButton}
            accessibilityRole="button"
          >
            <Feather name="log-out" size={18} color="#C64F3D" />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function AccountRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.accountRow}
      accessibilityRole="button"
    >
      <View style={styles.rowIcon}>
        <Feather name={icon} size={18} color="#55585D" />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={18} color="#A5A7AB" />
    </Pressable>
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
    paddingBottom: 36,
  },
  identity: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  name: {
    marginTop: 14,
    color: '#202124',
    fontSize: 19,
    fontWeight: '700',
  },
  email: {
    marginTop: 5,
    color: '#777A80',
    fontSize: 14,
  },
  sectionTitle: {
    marginBottom: 12,
    color: '#202124',
    fontSize: 16,
    fontWeight: '700',
  },
  accountCard: {
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  accountRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#F5F4F2',
  },
  rowCopy: {
    flex: 1,
  },
  rowTitle: {
    color: '#202124',
    fontSize: 14,
    fontWeight: '600',
  },
  rowSubtitle: {
    marginTop: 4,
    color: '#777A80',
    fontSize: 12,
  },
  divider: {
    height: 1,
    marginLeft: 50,
    backgroundColor: '#ECEDEF',
  },
  logoutButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 22,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  logoutText: {
    color: '#C64F3D',
    fontSize: 14,
    fontWeight: '600',
  },
});
