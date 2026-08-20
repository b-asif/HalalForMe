import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// The notification handler (what happens when a notification arrives while
// the app is in the foreground) is registered once, centrally, in
// lib/prayer/notifications.ts — that module is guaranteed to load at app
// startup (imported unconditionally from app/_layout.tsx via
// backgroundRefresh.ts), whereas this file only loads if/when a user visits
// the in-app Notifications screen. Registering it here too would silently
// overwrite that handler for anyone who happens to visit this screen,
// creating two competing registrations depending on load order — so it
// belongs in exactly one place, not both.

export async function registerPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) return; // simulators don't support push

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: 'e5a2f979-21b3-48cf-a4a0-1097a9e3d2f9',
  });
  const token = tokenData.data;

  // Upsert so duplicate tokens are ignored
  await supabase.from('push_tokens').upsert(
    { user_id: userId, token },
    { onConflict: 'user_id,token' }
  );
}

export async function unregisterPushToken(): Promise<void> {
  if (!Device.isDevice) return;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'e5a2f979-21b3-48cf-a4a0-1097a9e3d2f9',
    });
    await supabase.from('push_tokens').delete().eq('token', tokenData.data);
  } catch {
    // Best-effort: if the token can't be read or deleted, sign-out still proceeds.
  }
}
