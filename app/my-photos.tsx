import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Dimensions, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { formatError } from '../lib/errors';
import { useAuth } from '../contexts/AuthContext';
import { setGuestLoginIntent } from '../lib/guestLoginIntent';

const GREEN       = '#245737';
const COLS        = 3;
const SCREEN_W    = Dimensions.get('window').width;
const THUMB_SIZE  = (SCREEN_W - 4) / COLS; // 2px gaps

interface PhotoItem {
  url: string;
  restaurantName: string;
  type: 'food' | 'restaurant' | 'certification';
}

export default function MyPhotosScreen() {
  const router    = useRouter();
  const { user }  = useAuth();

  const [photos,   setPhotos]   = useState<PhotoItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [preview,  setPreview]  = useState<PhotoItem | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('submissions')
      .select('name, certification_photo_url, food_photo_urls, restaurant_photo_urls')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (err) {
      setError(formatError(err));
      setLoading(false);
      return;
    }

    const items: PhotoItem[] = [];
    for (const row of (data ?? [])) {
      const name = row.name ?? 'Unknown restaurant';
      if (row.certification_photo_url) {
        items.push({ url: row.certification_photo_url, restaurantName: name, type: 'certification' });
      }
      for (const url of (row.food_photo_urls ?? [])) {
        items.push({ url, restaurantName: name, type: 'food' });
      }
      for (const url of (row.restaurant_photo_urls ?? [])) {
        items.push({ url, restaurantName: name, type: 'restaurant' });
      }
    }

    setPhotos(items);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const typeLabel = (t: PhotoItem['type']) =>
    t === 'food' ? 'Food' : t === 'restaurant' ? 'Restaurant' : 'Certification';

  if (!user) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#111" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>My Photos</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.centered}>
          <Ionicons name="images-outline" size={56} color="#ddd" />
          <Text style={s.emptyTitle}>Sign in to see your photos</Text>
          <Text style={s.emptyText}>Photos you upload with restaurant submissions will appear here.</Text>
          <TouchableOpacity style={s.signInBtn} onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/login'); }}>
            <Text style={s.signInText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Photos</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={36} color="#ddd" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load}>
            <Text style={s.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : photos.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="images-outline" size={52} color="#ddd" />
          <Text style={s.emptyTitle}>No photos yet</Text>
          <Text style={s.emptyText}>
            Photos you upload when submitting a restaurant will appear here.
          </Text>
          <TouchableOpacity style={s.submitBtn} onPress={() => router.push('/submit-restaurant')}>
            <Text style={s.submitBtnText}>Submit a Restaurant</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={s.countLabel}>{photos.length} photo{photos.length !== 1 ? 's' : ''}</Text>
          <FlatList
            data={photos}
            keyExtractor={(_, i) => String(i)}
            numColumns={COLS}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.thumb}
                onPress={() => setPreview(item)}
                activeOpacity={0.85}
              >
                <Image
                  source={item.url}
                  style={s.thumbImg}
                  contentFit="cover"
                />
                <View style={s.thumbBadge}>
                  <Text style={s.thumbBadgeText}>{typeLabel(item.type)}</Text>
                </View>
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      {/* Full-screen preview */}
      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <View style={s.previewOverlay}>
          <TouchableOpacity
            style={s.previewClose}
            onPress={() => setPreview(null)}
            hitSlop={12}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {preview && (
            <>
              <Image
                source={preview.url}
                style={s.previewImage}
                contentFit="contain"
              />
              <View style={s.previewMeta}>
                <Text style={s.previewName}>{preview.restaurantName}</Text>
                <Text style={s.previewType}>{typeLabel(preview.type)} photo</Text>
              </View>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f5f5f5' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn:     { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },

  countLabel: {
    fontSize: 12, color: '#aaa', fontWeight: '500',
    paddingHorizontal: 14, paddingVertical: 8,
  },

  thumb: {
    width: THUMB_SIZE, height: THUMB_SIZE,
    margin: 1, position: 'relative',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  thumbBadgeText: { fontSize: 9, color: '#fff', fontWeight: '600' },

  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  errorText:  { fontSize: 13, color: '#888', textAlign: 'center' },
  retryBtn:   { backgroundColor: GREEN, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#ccc' },
  emptyText:  { fontSize: 14, color: '#bbb', textAlign: 'center', lineHeight: 20 },
  signInBtn: { marginTop: 8, backgroundColor: GREEN, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 14 },
  signInText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  submitBtn:  {
    marginTop: 6, backgroundColor: GREEN,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12,
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  previewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  previewClose: {
    position: 'absolute', top: 56, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  previewImage: { width: SCREEN_W, height: SCREEN_W, maxHeight: '70%' },
  previewMeta:  { marginTop: 16, alignItems: 'center', gap: 4 },
  previewName:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  previewType:  { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
});
