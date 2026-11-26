import { supabase } from '../../../lib/supabase';

export type ProfilePreferences = {
  fullName: string;
  avatarUrl: string | null;
  projectInvitationsEnabled: boolean;
  taskAssignmentsEnabled: boolean;
};

export async function getProfilePreferences(
  userId: string
): Promise<ProfilePreferences> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'full_name, avatar_url, push_project_invitations, push_task_assignments'
    )
    .eq('id', userId)
    .single();
  if (error) throw error;

  return {
    fullName: data.full_name,
    avatarUrl: data.avatar_url,
    projectInvitationsEnabled: data.push_project_invitations,
    taskAssignmentsEnabled: data.push_task_assignments,
  };
}

export async function updateProfileName(fullName: string) {
  const { error } = await supabase.auth.updateUser({
    data: { full_name: fullName },
  });
  if (error) throw error;
}

export async function updateProfileNotificationPreferences(
  userId: string,
  preferences: Pick<
    ProfilePreferences,
    'projectInvitationsEnabled' | 'taskAssignmentsEnabled'
  >
) {
  const { error } = await supabase
    .from('profiles')
    .update({
      push_project_invitations: preferences.projectInvitationsEnabled,
      push_task_assignments: preferences.taskAssignmentsEnabled,
    })
    .eq('id', userId)
    .select('id')
    .single();
  if (error) throw error;
}

export async function uploadProfilePhoto(
  userId: string,
  uri: string,
  mimeType: string | null | undefined,
  previousAvatarUrl: string | null
) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Unable to read the selected photo.');
  const file = await response.blob();
  const contentType =
    mimeType && /^image\/(jpeg|png|webp)$/.test(mimeType)
      ? mimeType
      : 'image/jpeg';
  const extension = contentType.split('/')[1].replace('jpeg', 'jpg');
  const storagePath = `${userId}/${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(storagePath, file, {
      contentType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('profile-photos')
    .getPublicUrl(storagePath);
  const avatarUrl = data.publicUrl;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)
    .select('id')
    .single();

  if (profileError) {
    const { error: cleanupError } = await supabase.storage
      .from('profile-photos')
      .remove([storagePath]);
    if (cleanupError) {
      console.error('Unable to clean up an unsaved profile photo:', cleanupError);
    }
    throw profileError;
  }

  const previousStoragePath = previousAvatarUrl
    ?.split('/storage/v1/object/public/profile-photos/')[1]
    ?.split('?')[0];
  if (previousStoragePath?.startsWith(`${userId}/`)) {
    const { error: cleanupError } = await supabase.storage
      .from('profile-photos')
      .remove([decodeURIComponent(previousStoragePath)]);
    if (cleanupError) {
      console.error('Unable to remove the previous profile photo:', cleanupError);
    }
  }

  return avatarUrl;
}
