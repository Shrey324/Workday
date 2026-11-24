
import { useEffect, useState, useRef } from 'react';
import {
  Stack,
  router,
  useSegments,
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from 'expo-router';

import {
  useColorScheme,
  View,
  StyleSheet,
  Animated,
  Easing,
  Alert,
} from 'react-native';

import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../../lib/supabase';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [splashFinished, setSplashFinished] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState(false);

  const processedUrls = useRef(new Set<string>());

  // Animation values
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslate = useRef(new Animated.Value(12)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const dotsOpacity = useRef(new Animated.Value(0.3)).current;

  // Restore session and listen for authentication changes
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Handle incoming password recovery links
  useEffect(() => {
    const handleIncomingUrl = async (url: string) => {
      if (processedUrls.current.has(url)) return;

      processedUrls.current.add(url);

      try {
        console.log('Incoming authentication URL:', url);

        const parsedUrl = new URL(url);
        const hashParams = new URLSearchParams(
          parsedUrl.hash.replace(/^#/, '')
        );

        const code = parsedUrl.searchParams.get('code');

        const tokenHash =
          parsedUrl.searchParams.get('token_hash') ||
          hashParams.get('token_hash');

        const accessToken =
          parsedUrl.searchParams.get('access_token') ||
          hashParams.get('access_token');

        const refreshToken =
          parsedUrl.searchParams.get('refresh_token') ||
          hashParams.get('refresh_token');

        let recoveryError = null;

        // PKCE authorization code
        if (code) {
          const { error } =
            await supabase.auth.exchangeCodeForSession(code);

          recoveryError = error;
        }

        // Email token hash
        else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });

          recoveryError = error;
        }

        // Access and refresh tokens
        else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          recoveryError = error;
        } else {
          console.log('No recovery credentials found in URL.');
          return;
        }

        if (recoveryError) {
          console.error('Recovery session error:', recoveryError.message);

          Alert.alert(
            'Invalid or expired link',
            'Please request a new password reset email.'
          );

          return;
        }

        console.log('Recovery session established.');

        setPendingRecovery(true);
      } catch (error) {
        console.error('Deep link handling error:', error);

        Alert.alert(
          'Recovery error',
          'Unable to process the password reset link.'
        );
      }
    };

    // Handle links when the app is already open
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });

    // Handle links that open the app from a closed state
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleIncomingUrl(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Splash screen animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),

      Animated.timing(logoScale, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }),

      Animated.sequence([
        Animated.delay(450),
        Animated.parallel([
          Animated.timing(titleOpacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(titleTranslate, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ]),

      Animated.sequence([
        Animated.delay(800),
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const dotsAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(dotsOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(dotsOpacity, {
          toValue: 0.3,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );

    dotsAnimation.start();

    const timer = setTimeout(() => {
      setSplashFinished(true);
    }, 2200);

    return () => {
      clearTimeout(timer);
      dotsAnimation.stop();
    };
  }, []);

  // Navigate to reset password after recovery session is ready
  useEffect(() => {
    if (loading || !splashFinished || !pendingRecovery) return;

    const currentScreen = segments[0];

    if (currentScreen === 'reset-password') {
      setPendingRecovery(false);
    } else {
      router.replace('/reset-password');
    }
  }, [
    loading,
    splashFinished,
    pendingRecovery,
    segments,
  ]);

  // Normal login/logout navigation
  useEffect(() => {
    if (loading || !splashFinished || pendingRecovery) return;

    const currentScreen = segments[0];

    // Never redirect away from the password reset screen
    if (currentScreen === 'reset-password') return;

    if (
      session &&
      (currentScreen === undefined || currentScreen === 'signup')
    ) {
      router.replace('/explore');
    } else if (!session && currentScreen === 'explore') {
      router.replace('/');
    }
  }, [
    session,
    loading,
    splashFinished,
    pendingRecovery,
    segments,
  ]);

  return (
    <ThemeProvider
      value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
    >
      <View style={styles.root}>
        {loading || !splashFinished ? (
          <View style={styles.splashContainer}>
            <Animated.Text
              style={[
                styles.logo,
                {
                  opacity: logoOpacity,
                  transform: [{ scale: logoScale }],
                },
              ]}
            >
              Oji
            </Animated.Text>

            <Animated.Text
              style={[
                styles.appName,
                {
                  opacity: titleOpacity,
                  transform: [{ translateY: titleTranslate }],
                },
              ]}
            >
              OJI VYAPAR
            </Animated.Text>

            <Animated.Text
              style={[
                styles.tagline,
                { opacity: taglineOpacity },
              ]}
            >
              Your Business. Simplified.
            </Animated.Text>

            <Animated.Text
              style={[
                styles.loadingDots,
                { opacity: dotsOpacity },
              ]}
            >
              • • •
            </Animated.Text>
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="explore" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="reset-password" />
          </Stack>
        )}
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },

splashContainer: {
  ...StyleSheet.absoluteFill,
  backgroundColor: '#000000',
  justifyContent: 'center',
  alignItems: 'center',
},

  logo: {
    color: '#FFFFFF',
    fontSize: 58,
    fontWeight: 'bold',
    letterSpacing: -2,
    textAlign: 'center',
  },

  appName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 8,
    textAlign: 'center',
  },

  tagline: {
    color: '#A3A3A3',
    fontSize: 13,
    marginTop: 12,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  loadingDots: {
    color: '#FFFFFF',
    fontSize: 20,
    marginTop: 35,
    letterSpacing: 4,
    textAlign: 'center',
  },
});
