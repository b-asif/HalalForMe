import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
