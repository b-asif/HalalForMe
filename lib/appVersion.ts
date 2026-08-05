import Constants from 'expo-constants';

/**
 * Single source of truth for the user-facing app version string.
 * Reads from app.json at runtime via expo-constants so profile, help,
 * and network User-Agent headers all stay in sync with the store version.
 */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';
