import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { formatError } from '../lib/errors';
import { useAuth } from '../contexts/AuthContext';
import { setGuestLoginIntent } from '../lib/guestLoginIntent';
import RestaurantCard, { Restaurant } from '../components/RestaurantCard';
import { Brand } from '../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

type HoursRange = { open: string; close: string };
type OpeningHours = Record<string, HoursRange | HoursRange[]> | null;

interface SavedRow {
  id: string;
  restaurant_id: string;
  restaurants: {
    id: string;
    name: string;
    address: string;
    cuisine_type: string;
    primary_certifier: string;
    is_verified: boolean;
    image_url: string | null;
    categorized_photos: Record<string, string[]> | null;
    opening_hours: OpeningHours;
    avg_rating?: number | null;
    review_count?: number | null;
  };
}

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isOpenNow(hours: OpeningHours): boolean {
  if (!hours) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const todayIdx     = now.getDay();
  const yesterdayIdx = (todayIdx + 6) % 7;

  const checkRanges = (dayVal: any, overnight: boolean): boolean => {
    if (!dayVal) return false;
    const ranges: HoursRange[] = Array.isArray(dayVal) ? dayVal : [dayVal];
    return ranges.some(r => {
      if (r.open === '00:00' && r.close === '00:00') return true;
      const [oh, om] = r.open.split(':').map(Number);
      const [ch, cm] = r.close.split(':').map(Number);
      const openMins  = oh * 60 + om;
      const closeMins = ch * 60 + cm;
      if (closeMins > openMins) return !overnight && cur >= openMins && cur < closeMins;
      return overnight ? cur < closeMins : cur >= openMins;
    });
  };

  return checkRanges(hours[WEEK_DAYS[todayIdx]], false)
      || checkRanges(hours[WEEK_DAYS[yesterdayIdx]], true);
}

export default function SavedRestaurantsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows]       = useState<SavedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    let { data, error: err } = await supabase
      .from('saved_restaurants')
      .select('id, restaurant_id, restaurants(id, name, address, cuisine_type, primary_certifier, is_verified, image_url, categorized_photos, opening_hours, avg_rating, review_count, zabihah_status)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    // Fallback if optional columns not yet added
    if (err?.message?.includes('avg_rating') || err?.message?.includes('review_count') || err?.message?.includes('opening_hours')) {
      ({ data, error: err } = await supabase
        .from('saved_restaurants')
        .select('id, restaurant_id, restaurants(id, name, address, cuisine_type, primary_certifier, is_verified, image_url, categorized_photos, zabihah_status)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100));
    }

    if (err) {
      setError(formatError(err));
    } else {
      setRows((data as unknown as SavedRow[]) ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const cards: Restaurant[] = rows.map(row => {
    const r = row.restaurants;
    return {
      id: r.id,
      name: r.name,
      cuisine: r.cuisine_type,
      rating: r.avg_rating ?? 0,
      reviewCount: r.review_count ?? 0,
      distance: '',
      isOpen: isOpenNow(r.opening_hours ?? null),
      primaryCertifier: r.primary_certifier ?? 'unknown',
      address: r.address,
      image_url: r.image_url,
      categorized_photos: r.categorized_photos,
      zabihah_status: (r as any).zabihah_status ?? null,
    };
  });

  if (!user) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
          <Text style={s.title}>Saved Restaurants</Text>
        </View>
        <View style={s.centered}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="heart" size={28} color={DEEP_GREEN} />
          </View>
          <Text style={s.emptyHeading}>Save your favourite spots</Text>
          <Text style={s.emptyBody}>
            Tap the heart on any restaurant to bookmark it. Sign in to save across devices.
          </Text>
          <TouchableOpacity style={s.signInBtn} onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/signup'); }}>
            <Text style={s.signInText}>Create Free Account</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/login'); }}>
            <Text style={s.signInLink}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.title}>Saved Restaurants</Text>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={36} color={TEXT_MUTED} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load}>
            <Text style={s.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : cards.length === 0 ? (
        <View style={s.centered}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="heart" size={28} color={DEEP_GREEN} />
          </View>
          <Text style={s.emptyHeading}>Nothing saved yet</Text>
          <Text style={s.emptyBody}>
            Tap the heart on any restaurant to bookmark it for later.
          </Text>
          <TouchableOpacity style={s.exploreBtn} onPress={() => router.push('/(tabs)/search')}>
            <Ionicons name="compass-outline" size={16} color={DEEP_GREEN} />
            <Text style={s.exploreBtnText}>Explore Restaurants</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              onPress={card => router.push(`/restaurant/${card.id}`)}
            />
          )}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={s.count}>
              {cards.length} saved restaurant{cards.length !== 1 ? 's' : ''}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: TEXT_DARK },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  errorText: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center' },
  retryBtn: { backgroundColor: DEEP_GREEN, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#e0d8c8', marginBottom: 4,
  },
  emptyHeading: { fontSize: 19, fontWeight: '800', color: TEXT_DARK, textAlign: 'center' },
  emptyBody:    { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 21 },
  signInBtn: { marginTop: 4, backgroundColor: DEEP_GREEN, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 14, width: '100%', alignItems: 'center' },
  signInText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  signInLink: { fontSize: 13, color: TEXT_MUTED, textDecorationLine: 'underline' },
  exploreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 4, paddingHorizontal: 24, paddingVertical: 13,
    borderRadius: 14, borderWidth: 1.5, borderColor: DEEP_GREEN,
    width: '100%', justifyContent: 'center',
  },
  exploreBtnText: { fontSize: 15, fontWeight: '700', color: DEEP_GREEN },
  list: { paddingTop: 8, paddingBottom: 24 },
  count: { fontSize: 13, color: TEXT_MUTED, paddingHorizontal: 16, marginBottom: 8, fontWeight: '500' },
});
