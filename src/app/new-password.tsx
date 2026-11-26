import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
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
import {
  clearCurrentPasswordVerification,
  isCurrentPasswordVerified,
} from '../features/profile/password-verification';

export default function NewPasswordScreen() {
  const [isAuthorized] = useState(isCurrentPasswordVerified);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isAuthorized) router.replace('/change-password');
  }, [isAuthorized]);

  const savePassword = async () => {
    if (!isAuthorized) {
      router.replace('/change-password');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError('Passwords do not match.');
      return;
    }

    setConfirmError('');
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      clearCurrentPasswordVerification();
      Alert.alert('Password updated', 'Your password has been changed.');
      router.replace('/profile');
    } catch (error) {
      console.error('Unable to update the password:', error);
      Alert.alert(
        'Unable to change password',
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
        <Text style={styles.headerTitle}>New password</Text>
        <View style={styles.headerSpacer} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.subtitle}>
            Your password must be at least 6 characters long.
          </Text>
          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter new password"
            placeholderTextColor="#A5A7AB"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            style={[styles.input, confirmError && styles.inputError]}
            value={confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              setConfirmError('');
            }}
            placeholder="Confirm new password"
            placeholderTextColor="#A5A7AB"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            returnKeyType="done"
            onSubmitEditing={() => void savePassword()}
          />
          {!!confirmError && (
            <Text style={styles.errorText}>{confirmError}</Text>
          )}
          <Pressable
            onPress={() => void savePassword()}
            disabled={isSaving || !isAuthorized}
            style={[
              styles.primaryButton,
              (isSaving || !isAuthorized) && styles.disabledButton,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {isSaving ? 'Saving…' : 'Save new password'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  content: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 34,
    paddingBottom: 36,
  },
  title: {
    color: '#202124',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    color: '#777A80',
    fontSize: 14,
    lineHeight: 21,
  },
  label: {
    marginTop: 24,
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
  inputError: {
    borderColor: '#D94B45',
  },
  errorText: {
    marginTop: 7,
    color: '#D94B45',
    fontSize: 13,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    borderRadius: 11,
    backgroundColor: '#202124',
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
