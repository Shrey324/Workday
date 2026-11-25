
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';

import { supabase } from '../../lib/supabase';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');

  const handleResetPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert('Missing email', 'Please enter your email address.');
      return;
    }

    if (!/^[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    try {
      const redirectUrl = Linking.createURL('reset-password');

      console.log('Password reset redirect:', redirectUrl);

      const { error } = await supabase.auth.resetPasswordForEmail(
        cleanEmail,
        {
          redirectTo: redirectUrl,
        }
      );

      if (error) {
        Alert.alert('Reset failed', error.message);
        return;
      }

      Alert.alert(
        'Check your email',
        'If an account exists with this email, you will receive a password reset link.'
      );
    } catch (error) {
      console.error('Password reset error:', error);

      Alert.alert(
        'Error',
        'Unable to send the reset link. Please try again.'
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Forgot Password?</Text>

      <Text style={styles.description}>
        Enter the email address associated with your account.
        We will send you instructions to reset your password.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        style={styles.button}
        onPress={handleResetPassword}
      >
        <Text style={styles.buttonText}>Send Reset Link</Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/')}>
        <Text style={styles.backText}>Back to Sign In</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111111',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#666666',
    marginBottom: 28,
  },
  input: {
    height: 54,
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 18,
  },
  button: {
    height: 54,
    backgroundColor: '#222222',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  backText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 15,
    color: '#333333',
  },
});
