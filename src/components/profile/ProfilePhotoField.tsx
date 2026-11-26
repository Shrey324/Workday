import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { uploadProfilePhoto } from '../../features/profile/api';

export function ProfilePhotoField({
  userId,
  avatarUrl,
  fullName,
  onPhotoSaved,
}: {
  userId: string;
  avatarUrl: string | null;
  fullName: string;
  onPhotoSaved: (avatarUrl: string) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);

  const choosePhoto = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo access needed',
          'Allow access to your photo library to choose a profile photo.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;

      setIsSaving(true);
      const asset = result.assets[0];
      const savedUrl = await uploadProfilePhoto(
        userId,
        asset.uri,
        asset.mimeType,
        avatarUrl
      );
      onPhotoSaved(savedUrl);
    } catch (error) {
      console.error('Unable to update the profile photo:', error);
      Alert.alert(
        'Photo upload failed',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const initials = fullName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.container}>
      <Pressable
        onPress={choosePhoto}
        disabled={isSaving}
        style={styles.avatarButton}
        accessibilityRole="button"
        accessibilityLabel="Choose a profile photo"
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            {initials ? (
              <Text style={styles.initials}>{initials}</Text>
            ) : (
              <Feather name="user" size={35} color="#777A80" />
            )}
          </View>
        )}
        {isSaving && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}
      </Pressable>
      <Pressable
        onPress={choosePhoto}
        disabled={isSaving}
        style={styles.changeButton}
        accessibilityRole="button"
      >
        <Feather name="camera" size={14} color="#D76A24" />
        <Text style={styles.changeText}>
          {isSaving ? 'Saving photo…' : 'Change photo'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  avatarButton: {
    width: 104,
    height: 104,
    overflow: 'hidden',
    borderRadius: 52,
    backgroundColor: '#E8E5E0',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#202124',
    fontSize: 28,
    fontWeight: '700',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    padding: 4,
  },
  changeText: {
    color: '#D76A24',
    fontSize: 13,
    fontWeight: '600',
  },
});
