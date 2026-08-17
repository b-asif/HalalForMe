import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Brand } from '../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const CREAM      = Brand.cream;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const GOLD       = Brand.gold;

const TYPES = [
  {
    icon: 'restaurant-outline' as const,
    label: 'Restaurant or Cafe',
    sub: 'Add your halal eatery to Rihdal',
    route: '/add-my-business' as const,
    businessType: 'restaurant' as const,
  },
  {
    icon: 'moon-outline' as const,
    label: 'Masjid',
    sub: 'Register your masjid with the community',
    route: '/redeem-mosque' as const,
    businessType: 'mosque' as const,
  },
  {
    icon: 'storefront-outline' as const,
    label: 'Other Halal Business',
    sub: 'Grocery, butcher, service, or other',
    route: '/add-my-business' as const,
    businessType: 'other' as const,
  },
] as const;

export default function BusinessTypeScreen() {
  const router  = useRouter();
  const { user } = useAuth();

  const handleSelect = async (route: string, businessType: 'restaurant' | 'mosque' | 'other') => {
    if (user) {
      await supabase.from('profiles').update({ business_type: businessType }).eq('id', user.id);
    }
    router.replace(route as any);
  };

  return (
    <SafeAreaView style={s.flex}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.iconWrap}>
            <Ionicons name="business-outline" size={30} color={GOLD} />
          </View>
          <Text style={s.title}>What are you registering?</Text>
          <Text style={s.subtitle}>
            We'll walk you through setting up your listing. Our team reviews
            every application before it goes live.
          </Text>
        </View>

        {/* Type options */}
        <View style={s.options}>
          {TYPES.map(({ icon, label, sub, route, businessType }) => (
            <TouchableOpacity
              key={label}
              style={s.option}
              onPress={() => handleSelect(route, businessType)}
              activeOpacity={0.75}
            >
              <View style={s.optionIcon}>
                <Ionicons name={icon} size={22} color={GREEN} />
              </View>
              <View style={s.optionText}>
                <Text style={s.optionLabel}>{label}</Text>
                <Text style={s.optionSub}>{sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={HAIRLINE} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Skip */}
        <TouchableOpacity
          style={s.skipBtn}
          onPress={() => router.replace('/(tabs)')}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        >
          <Text style={s.skipText}>Do this later</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: CREAM },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },

  header: { alignItems: 'center', marginBottom: 36 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: DEEP_GREEN, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22, fontWeight: '800', color: TEXT_DARK,
    textAlign: 'center', marginBottom: 10,
  },
  subtitle: {
    fontSize: 14, color: TEXT_MUTED, textAlign: 'center',
    lineHeight: 21, maxWidth: 300,
  },

  options: { gap: 12 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 16,
    borderWidth: 1.5, borderColor: HAIRLINE,
    shadowColor: '#000', shadowOpacity: 0.04,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  optionIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center',
  },
  optionText:  { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  optionSub:   { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },

  skipBtn: { alignSelf: 'center', marginTop: 32 },
  skipText: { fontSize: 13, color: TEXT_MUTED, textDecorationLine: 'underline' },
});
