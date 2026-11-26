import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { ProfilePhotoField } from '../components/profile/ProfilePhotoField';
import {
  getProfilePreferences,
  updateProfileName,
} from '../features/profile/api';

export default function PersonalInformationScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
        const profile = await getProfilePreferences(data.user.id);
        if (!active) return;
        setUserId(data.user.id);
        setEmail(data.user.email ?? '');
        setFullName(profile.fullName);
        setAvatarUrl(profile.avatarUrl);
      } catch (error) {
        console.error('Unable to load personal information:', error);
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

  const saveChanges = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Enter your full name to continue.');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfileName(trimmedName);
      router.back();
    } catch (error) {
      console.error('Unable to update personal information:', error);
      Alert.alert(
        'Unable to save changes',
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
        <Text style={styles.headerTitle}>Personal information</Text>
        <View style={styles.headerSpacer} />
      </View>
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#D76A24" />
        </View>
      ) : userId ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <ProfilePhotoField
              userId={userId}
              avatarUrl={avatarUrl}
              fullName={fullName}
              onPhotoSaved={setAvatarUrl}
            />
            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter your full name"
              placeholderTextColor="#A5A7AB"
              autoCapitalize="words"
              autoComplete="name"
              maxLength={100}
              returnKeyType="done"
            />
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={[styles.input, styles.readOnlyInput]}
              value={email}
              editable={false}
              autoCapitalize="none"
            />
            <Pressable
              onPress={() => void saveChanges()}
              disabled={isSaving}
              style={[styles.saveButton, isSaving && styles.disabledButton]}
              accessibilityRole="button"
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F6',
  },
  flex: {
    flex: 1,
  },
  header: {
    minHeight: 58,
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
    fontSize: 16,
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
    paddingTop: 28,
    paddingBottom: 36,
  },
  label: {
    marginTop: 25,
    marginBottom: 8,
    color: '#333333',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E1E2E4',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    color: '#202124',
    fontSize: 15,
  },
  readOnlyInput: {
    color: '#777A80',
    backgroundColor: '#F0F0EF',
  },
  saveButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    borderRadius: 11,
    backgroundColor: '#202124',
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
