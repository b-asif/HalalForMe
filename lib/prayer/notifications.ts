// Native-calling module — imports expo-notifications, so this cannot run
// under plain Node (see notificationPlan.ts for why that matters). Needs
// on-device verification, same as coordinates.ts and settingsStore.ts.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { computeNotificationPlan, PlannedNotification } from './notificationPlan';
import { PrayerSettings } from './settingsStore';
import { ResolvedCoordinates } from './coordinates';

export { NOTIFIABLE_PRAYERS, SCHEDULE_DAYS_AHEAD, computeNotificationPlan } from './notificationPlan';
export type { PlannedNotification } from './notificationPlan';

/**
 * Registered at module load — this file is guaranteed to load at app
 * startup (imported unconditionally from app/_layout.tsx via
 * backgroundRefresh.ts's import of rescheduleAllPrayerNotifications below).
 *
 * This is not optional polish: per expo-notifications' own documentation,
 * "the default behavior when the handler is not set... is not to show the
 * notification" for anything arriving while the app is in the foreground.
 * Without this, a prayer notification firing while the app happens to be
 * open is silently discarded — no banner, no sound, nothing. shouldShowBanner
 * and shouldShowList are the current required fields (shouldShowAlert is
 * deprecated in this version of expo-notifications).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * DATE-type trigger on both platforms — CALENDAR was tried on iOS first to
 * get wall-clock/DST-aware matching "for free" from the OS, and was reverted
 * after on-device testing showed it to be fundamentally broken: scheduling
 * reported success (no thrown error) but the notification never appeared in
 * getAllScheduledNotificationsAsync() moments later — confirmed repeatedly,
 * on a real device, with correct permissions and Focus settings, ruling out
 * every environmental explanation. Traced to expo-notifications' own iOS
 * native source (Records.swift, CalendarTriggerRecord): it builds the
 * DateComponents using `Calendar(identifier: .iso8601)`, which is atypical
 * (most trigger-building code uses the default Gregorian calendar) and is
 * the most plausible explanation for requests that build without error yet
 * never actually persist with the OS.
 *
 * DATE-type triggers convert internally to UNTimeIntervalNotificationTrigger
 * on iOS (Records.swift, DateTriggerRecord) — an elapsed-seconds countdown
 * from `fireDate`. This is NOT a DST problem despite appearances: `fireDate`
 * is an absolute instant already resolved correctly for DST by our own
 * computation (computeNotificationPlan, via Luxon + the IANA tz database) —
 * a JS/Swift `Date` carries no timezone info, so "seconds until this
 * instant" is just arithmetic between two fixed points and is unaffected by
 * however the wall clock happens to be labeled when a DST transition occurs
 * in between. The DST-awareness lives entirely in how `fireDate` was
 * computed, not in which trigger primitive receives it.
 *
 * On Android, DATE-type triggers already store a real absolute epoch
 * timestamp compared directly against "now" (NotificationTriggers.kt,
 * DateTrigger), and CALENDAR was never implemented in Android's native
 * trigger dispatch to begin with.
 */
function buildTrigger(fireDate: Date, _timeZone: string): Notifications.NotificationTriggerInput {
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: fireDate,
    channelId: ANDROID_CHANNEL_ID,
  };
}

export const ANDROID_CHANNEL_ID = 'prayer-times';

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Prayer times',
    importance: Notifications.AndroidImportance.MAX,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Cancels every pending prayer notification and schedules a fresh rolling
 * window from current settings/location. This is the ONLY way notifications
 * should ever be updated — always a full cancel-then-reschedule, never a
 * partial/incremental change, so a stale and a fresh schedule can never
 * coexist. Safe to call as often as needed (e.g. on every settings change,
 * every app foreground) — cancelling zero notifications is a no-op.
 */
export async function rescheduleAllPrayerNotifications(
  coords: ResolvedCoordinates,
  settings: PrayerSettings,
): Promise<{ scheduled: number; permissionGranted: boolean; plan: PlannedNotification[] }> {
  await ensureAndroidNotificationChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const permissionGranted = await requestNotificationPermission();
  if (!permissionGranted) return { scheduled: 0, permissionGranted: false, plan: [] };

  const plan = computeNotificationPlan(coords, settings, new Date());

  for (const item of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: item.identifier,
      content: {
        title: item.title,
        body: item.body,
        sound: true,
        // NOTE: interruptionLevel: 'timeSensitive' was removed here — it
        // requires the Time Sensitive Notifications entitlement, which this
        // app does not have configured. On-device testing showed
        // scheduleNotificationAsync reporting success while the OS silently
        // never registered the request (confirmed via
        // getAllScheduledNotificationsAsync returning empty) — consistent
        // with iOS rejecting the request over the missing entitlement
        // without that rejection surfacing as a JS-catchable error. Revisit
        // only after actually adding the entitlement and re-verifying.
      },
      trigger: buildTrigger(item.fireDate, coords.timeZone),
    });
  }

  // Deliberately returning our own already-computed plan rather than reading
  // scheduled notifications back from the OS afterward — verified that's
  // unreliable across platforms: iOS's DATE/CALENDAR triggers don't
  // preserve a queryable absolute fire time the way you'd expect (a DATE
  // trigger becomes a relative time-interval internally), and Android's
  // serialized field name for it is `value`, not `date` or `timestamp`.
  // We already know exactly what we scheduled and when — no need to ask
  // the OS to tell us something it may not even be able to answer.
  return { scheduled: plan.length, permissionGranted: true, plan };
}
