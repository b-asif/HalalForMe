import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'quran_last_read_v1';

export interface QuranProgress {
  surahNumber: number;
  surahName: string;   // englishName, e.g. "Al-Kahf"
  ayahNumber: number;  // 1-based, exact — set by the user tapping the bookmark
  totalAyahs: number;
}

export async function saveProgress(p: QuranProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export async function loadProgress(): Promise<QuranProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QuranProgress) : null;
  } catch {
    return null;
  }
}
