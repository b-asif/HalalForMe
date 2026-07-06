import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Brand } from '../lib/theme';

const CREAM = Brand.cream;
const GREEN = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

interface BlockedUser {
  id: string;
  blocked_id: string;
  created_at: string;
  name: string | null;
}

export default function BlockedUsersScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [blocks,     setBlocks]     = useState<BlockedUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Step 1: fetch block rows (no FK-based join — blocked_id → auth.users, not profiles)
    const { data: blockData } = await supabase
      .from('blocks')
      .select('id, blocked_id, created_at')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });

    const rawBlocks = (blockData ?? []) as { id: string; blocked_id: string; created_at: string }[];

    // Step 2: batch-fetch display names from profiles
    const blockedIds = rawBlocks.map(b => b.blocked_id);
    const nameMap: Record<string, string | null> = {};
    if (blockedIds.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', blockedIds);
      for (const p of (profileData ?? []) as { id: string; name: string | null }[]) {
        nameMap[p.id] = p.name;
      }
    }

    setBlocks(rawBlocks.map(b => ({ ...b, name: nameMap[b.blocked_id] ?? null })));
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmUnblock = (blockId: string, blockedId: string, name: string) => {
    Alert.alert(
      `Unblock ${name}?`,
      "Their content will become visible to you again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            setUnblocking(blockedId);
            const { error } = await supabase
              .from('blocks')
              .delete()
              .eq('id', blockId);
            if (!error) {
              setBlocks(prev => prev.filter(b => b.id !== blockId));
            } else {
              Alert.alert('Error', error.message);
            }
            setUnblocking(null);
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={s.flex}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.title}>Blocked Users</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : blocks.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="people-outline" size={52} color={TEXT_MUTED} />
          <Text style={s.emptyTitle}>No blocked users</Text>
          <Text style={s.emptySub}>Users you block on reviews will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={blocks}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => {
            const name = item.name ?? 'Unknown User';
            const isUnblocking = unblocking === item.blocked_id;
            const blockedDate = new Date(item.created_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            });
            return (
              <View style={s.row}>
                <View style={s.avatar}>
                  <Text style={s.initials}>{name[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={s.meta}>
                  <Text style={s.name}>{name}</Text>
                  <Text style={s.date}>Blocked {blockedDate}</Text>
                </View>
                <TouchableOpacity
                  style={s.unblockBtn}
                  onPress={() => confirmUnblock(item.id, item.blocked_id, name)}
                  disabled={isUnblocking}
                >
                  {isUnblocking
                    ? <ActivityIndicator size="small" color={GREEN} />
                    : <Text style={s.unblockText}>Unblock</Text>}
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: TEXT_DARK },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: TEXT_MUTED },
  emptySub:   { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },

  list: { padding: 16, paddingBottom: 40 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  initials:   { fontSize: 16, fontWeight: '700', color: TEXT_MUTED },
  meta:       { flex: 1 },
  name:       { fontSize: 15, fontWeight: '600', color: TEXT_DARK },
  date:       { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },

  unblockBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: GREEN,
    minWidth: 72, alignItems: 'center',
  },
  unblockText: { fontSize: 13, fontWeight: '700', color: GREEN },
});
