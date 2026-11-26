import { useState } from 'react';
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
import { markCurrentPasswordVerified } from '../features/profile/password-verification';

export default function VerifyCurrentPasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const verifyPassword = async () => {
    if (!currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }

    setPasswordError('');
    setIsChecking(true);
    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const email = data.user?.email;
      if (!email) {
        Alert.alert('Unable to verify password', 'Your account email is unavailable.');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (error) {
        if (
          error.code === 'invalid_credentials' ||
          error.message.toLowerCase().includes('invalid login credentials')
        ) {
          setPasswordError('Not matching your current password.');
          return;
        }
        throw error;
      }

      markCurrentPasswordVerified();
      router.push('/new-password');
    } catch (error) {
      console.error('Unable to verify the current password:', error);
      Alert.alert(
        'Unable to verify password',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsChecking(false);
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
        <Text style={styles.headerTitle}>Change password</Text>
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
          <Text style={styles.title}>Verify it’s you</Text>
          <Text style={styles.subtitle}>
            Enter your current password before choosing a new one.
          </Text>
          <Text style={styles.label}>Current password</Text>
          <TextInput
            style={[styles.input, passwordError && styles.inputError]}
            value={currentPassword}
            onChangeText={(value) => {
              setCurrentPassword(value);
              setPasswordError('');
            }}
            placeholder="Enter current password"
            placeholderTextColor="#A5A7AB"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            returnKeyType="done"
            onSubmitEditing={() => void verifyPassword()}
          />
          {!!passwordError && (
            <Text style={styles.errorText}>{passwordError}</Text>
          )}
          <Pressable
            onPress={() => void verifyPassword()}
            disabled={isChecking}
            style={[styles.primaryButton, isChecking && styles.disabledButton]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {isChecking ? 'Checking…' : 'Continue'}
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
    marginTop: 28,
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
    marginTop: 24,
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
