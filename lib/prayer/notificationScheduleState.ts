import AsyncStorage from '@react-native-async-storage/async-storage';
import { DateTime } from 'luxon';

const STORAGE_KEY = 'prayer_notification_schedule_state_v1';

/** How long a schedule is trusted before a routine refresh is due, even if
 *  nothing else changed — keeps the rolling window from running down without
 *  ever depending on a background task actually firing. */
const ROUTINE_REFRESH_HOURS = 20;

interface ScheduleState {
  lastScheduledAtIso: string;
  lastScheduledOffsetMinutes: number;
}

export function currentOffsetMinutes(timeZone: string): number {
  return DateTime.now().setZone(timeZone).offset;
}

export async function recordScheduled(timeZone: string): Promise<void> {
  const state: ScheduleState = {
    lastScheduledAtIso: DateTime.now().toISO()!,
    lastScheduledOffsetMinutes: currentOffsetMinutes(timeZone),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

async function loadScheduleState(): Promise<ScheduleState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScheduleState) : null;
  } catch {
    return null;
  }
}

/**
 * True if the schedule has never been recorded, the UTC offset for the
 * current time zone has changed since it was last recorded (covers both a
 * DST transition and a travel-driven time zone change), or enough time has
 * passed that a routine refresh is due regardless. Pure decision logic
 * given a state snapshot — kept separate from AsyncStorage I/O so it's
 * testable without a real device.
 */
export function needsReschedule(state: ScheduleState | null, timeZone: string, now: Date): boolean {
  if (!state) return true;

  const currentOffset = currentOffsetMinutes(timeZone);
  if (currentOffset !== state.lastScheduledOffsetMinutes) return true;

  const hoursSinceLastSchedule = DateTime.fromJSDate(now).diff(
    DateTime.fromISO(state.lastScheduledAtIso), 'hours',
  ).hours;
  return hoursSinceLastSchedule >= ROUTINE_REFRESH_HOURS;
}

/** Convenience wrapper combining the AsyncStorage read with the pure check above. */
export async function shouldReschedule(timeZone: string, now: Date = new Date()): Promise<boolean> {
  const state = await loadScheduleState();
  return needsReschedule(state, timeZone, now);
}
