import { useEffect, useRef, useState } from 'react';
import {
  Animated, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brand, Radius, Spacing, Type } from '../lib/theme';

export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [applying, setApplying] = useState(false);
  const slideY = useRef(new Animated.Value(120)).current;
  const insets = useSafeAreaInsets();

  const { isUpdateAvailable } = Updates.useUpdates();

  // Trigger an update check after the splash clears (~3 s).
  // Skipped in dev / Expo Go where expo-updates is a no-op.
  useEffect(() => {
    if (__DEV__) return;
    const t = setTimeout(async () => {
      try {
        await Updates.checkForUpdateAsync();
      } catch {
        // Embedded launch or network unavailable — silently ignore.
      }
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // Animate the banner in when expo-updates signals a new bundle is ready.
  useEffect(() => {
    if (!isUpdateAvailable) return;
    setVisible(true);
    Animated.spring(slideY, {
      toValue: 0,
      tension: 60,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [isUpdateAvailable]);

  const handleUpdate = async () => {
    setApplying(true);
    try {
      await Updates.downloadUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      // Download failed — hide the banner rather than leaving a broken state.
      setApplying(false);
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    Animated.timing(slideY, {
      toValue: 120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        // Sit above the tab bar (49 px) plus device safe area plus a small gap.
        { bottom: insets.bottom + 56, transform: [{ translateY: slideY }] },
      ]}
    >
      <View style={styles.row}>
        <Text style={styles.arrow}>↑</Text>
        <Text style={styles.message}>A new version of Rihdal is available.</Text>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.cta, applying && styles.ctaDisabled]}
        onPress={handleUpdate}
        disabled={applying}
        activeOpacity={0.75}
      >
        <Text style={styles.ctaText}>{applying ? 'Updating…' : 'Update now'}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Brand.deepGreen,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md - 4,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  arrow: {
    fontSize: 16,
    color: Brand.gold,
  },
  message: {
    flex: 1,
    ...Type.body,
    color: Brand.cream,
    fontWeight: '500' as const,
  },
  close: {
    fontSize: 13,
    color: Brand.cream,
    opacity: 0.55,
  },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.chip,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    ...Type.label,
    color: Brand.gold,
    fontWeight: '700' as const,
  },
});
