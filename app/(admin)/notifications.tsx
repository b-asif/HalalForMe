import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const GREEN = '#245737';

interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link_type: string | null;
  link_id: string | null;
  is_read: boolean;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  submission:   { icon: 'document-text-outline', color: '#3b82f6', bg: '#eff6ff' },
  review:       { icon: 'star-outline',          color: '#f6a623', bg: '#fffbeb' },
  claim:        { icon: 'storefront-outline',    color: '#b7791f', bg: '#fefce8' },
  owner_signup: { icon: 'person-add-outline',    color: GREEN,     bg: '#e6f9f2' },
  digest:       { icon: 'bar-chart-outline',     color: '#8b5cf6', bg: '#f5f3ff' },
  general:      { icon: 'notifications-outline', color: '#aaa',    bg: '#f5f5f5' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days < 7)    return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type Filter = 'all' | 'unread';

export default function AdminNotificationsScreen() {
  const router = useRouter();

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<Filter>('all');

  const loadNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('admin_notifications')
      .select('id, type, title, body, link_type, link_id, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    setNotifications((data as AdminNotification[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Mark all as read when screen is opened
  useFocusEffect(useCallback(() => {
    loadNotifications().then(() => {
      supabase
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('is_read', false)
        .then(() => {
          setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        });
    });
  }, [loadNotifications]));

  const onRefresh = () => { setRefreshing(true); loadNotifications(); };

  const handleNotificationPress = (n: AdminNotification) => {
    if (!n.link_type || !n.link_id) return;
    switch (n.link_type) {
      case 'submission': router.push(`/(admin)/review/${n.link_id}`); break;
      case 'review':     router.push(`/(admin)/reviews`);             break;
      case 'claim':      router.push(`/(admin)/claim/${n.link_id}`);  break;
      case 'restaurant': router.push(`/restaurant/${n.link_id}`);     break;
    }
  };

  const markAllRead = async () => {
    await supabase.from('admin_notifications').update({ is_read: true }).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const displayed = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} unreadCount={0} onMarkAll={markAllRead} />
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <Header router={router} unreadCount={unreadCount} onMarkAll={markAllRead} />

      {/* Filter tabs */}
      <View style={s.tabs}>
        {(['all', 'unread'] as Filter[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[s.tab, filter === f && s.tabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.tabText, filter === f && s.tabTextActive]}>
              {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={displayed}
        keyExtractor={item => item.id}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons name="notifications-off-outline" size={48} color="#d0d0d0" />
            <Text style={s.emptyText}>
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.general;
          const tappable = !!item.link_type && !!item.link_id;
          return (
            <TouchableOpacity
              style={[s.card, !item.is_read && s.cardUnread]}
              onPress={() => handleNotificationPress(item)}
              activeOpacity={tappable ? 0.75 : 1}
            >
              <View style={[s.iconWrap, { backgroundColor: cfg.bg }]}>
                <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
              </View>
              <View style={s.cardBody}>
                <View style={s.cardTop}>
                  <Text style={[s.cardTitle, !item.is_read && s.cardTitleUnread]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!item.is_read && <View style={s.unreadDot} />}
                </View>
                <Text style={s.cardBody2} numberOfLines={2}>{item.body}</Text>
                <Text style={s.cardTime}>{timeAgo(item.created_at)}</Text>
              </View>
              {tappable && (
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

function Header({ router, unreadCount, onMarkAll }: {
  router: any;
  unreadCount: number;
  onMarkAll: () => void;
}) {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color="#111" />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Notifications</Text>
      {unreadCount > 0 ? (
        <TouchableOpacity onPress={onMarkAll} style={s.markAllBtn}>
          <Text style={s.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 80 }} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111', textAlign: 'center' },
  markAllBtn:  { width: 80, alignItems: 'flex-end' },
  markAllText: { fontSize: 13, color: GREEN, fontWeight: '600' },

  tabs: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  tab: {
    flex: 1, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: GREEN },
  tabText:       { fontSize: 14, fontWeight: '600', color: '#aaa' },
  tabTextActive: { color: GREEN },

  listContent: { padding: 16, paddingBottom: 40 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    gap: 12,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: GREEN },

  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  cardBody:  { flex: 1, gap: 3 },
  cardTop:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: '#555' },
  cardTitleUnread: { color: '#111' },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  cardBody2: { fontSize: 13, color: '#888', lineHeight: 18 },
  cardTime:  { fontSize: 11, color: '#bbb' },

  emptyBox:  { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 15, color: '#bbb', fontWeight: '500' },
});
