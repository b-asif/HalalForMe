// Native-only module — no pure/testable subset here beyond what
// notificationScheduleState.ts already covers (needsReschedule is tested
// there). GPS resolution and notification scheduling are inherently native
// calls, so this needs on-device verification like coordinates.ts,
// settingsStore.ts, and notifications.ts did.
//
// IMPORTANT: `TaskManager.defineTask` below runs at module load time,
// unconditionally, on purpose. When iOS/Android wake the app in the
// background to run this task, they re-execute the JS bundle from scratch —
// if this module (or something that imports it) isn't loaded on every
// launch, the task manager has nothing registered to call and the
// background refresh silently does nothing. This module must be imported
// unconditionally from the app's actual entry point (e.g. app/_layout.tsx),
// not lazily from a settings screen — that's a wiring step still pending.

import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { BackgroundTaskResult, BackgroundTaskStatus } from 'expo-background-task';
import { loadPrayerSettings, PrayerSettings } from './settingsStore';
import { resolveGpsCoordinates, ResolvedCoordinates } from './coordinates';
import { rescheduleAllPrayerNotifications } from './notifications';
import { shouldReschedule, recordScheduled } from './notificationScheduleState';

export const BACKGROUND_TASK_NAME = 'prayer-notification-refresh';

/**
 * In manual-city mode we already have cached coordinates — no need to touch
 * GPS at all. In GPS mode, resolveGpsCoordinates() only succeeds silently if
 * permission was already granted during normal foreground use; the OS won't
 * show a permission prompt from a background task, so a not-yet-granted
 * case just resolves to null here and this cycle is skipped, exactly the
 * same graceful fallback coordinates.ts already has for the foreground case.
 */
async function resolveCoordsForBackgroundRefresh(settings: PrayerSettings): Promise<ResolvedCoordinates | null> {
  if (settings.locationMode === 'manual' && settings.manualCity) return settings.manualCity;
  return resolveGpsCoordinates();
}

TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    const settings = await loadPrayerSettings();
    const coords = await resolveCoordsForBackgroundRefresh(settings);
    if (!coords) return BackgroundTaskResult.Failed; // nothing we can do without a location this cycle

    const due = await shouldReschedule(coords.timeZone);
    if (!due) return BackgroundTaskResult.Success; // schedule is still fresh, nothing to do

    const result = await rescheduleAllPrayerNotifications(coords, settings);
    if (result.permissionGranted) await recordScheduled(coords.timeZone);
    return result.permissionGranted ? BackgroundTaskResult.Success : BackgroundTaskResult.Failed;
  } catch (err) {
    console.error('[prayer background refresh] task failed:', err);
    return BackgroundTaskResult.Failed;
  }
});

/**
 * Registers the background refresh. Safe to call multiple times — re-
 * registering an already-registered task just updates its options. Should
 * be called once during app startup (e.g. after the user completes initial
 * prayer setup), not on every render.
 */
export async function registerBackgroundPrayerRefresh(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTaskStatus.Available) return; // e.g. restricted by OS/device settings

  await BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, {
    // The OS treats this as a minimum, not a guarantee — background fetch
    // timing is entirely OS-discretionary, especially on iOS. The 7-day
    // rolling window in notificationPlan.ts is what actually protects
    // against this running rarely or not at all for a while.
    minimumInterval: 12 * 60,
  });
}

export async function unregisterBackgroundPrayerRefresh(): Promise<void> {
  await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME);
}
