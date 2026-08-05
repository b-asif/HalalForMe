import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';

import { qiblaBearing, relativeQiblaAngle } from '../lib/prayer/qibla';
import { getCurrentHeading, watchHeading, HeadingReading } from '../lib/prayer/compass';
import { resolveGpsCoordinates, ResolvedCoordinates } from '../lib/prayer/coordinates';
import { loadPrayerSettings } from '../lib/prayer/settingsStore';
import { Brand } from '../lib/theme';

const CREAM = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const GOLD = Brand.gold;
const TEXT_DARK = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE = Brand.hairline;
const RED = Brand.red;
const AMBER = Brand.amber;

/** Maps the 0-3 numeric accuracy from expo-location to the plain-language
 *  label used on-screen — presentation only, same underlying value. */
const ACCURACY_LABELS = ['None', 'Low', 'Medium', 'High'];

// compass.png source dimensions (871x1806) — used to compute its exact
// on-screen height so it can be anchored to the bottom edge deterministically
// (bottom-of-image = bottom-of-screen), rather than trusting resizeMode's
// automatic fill behavior, which doesn't let us control which edge the crop
// favors and clearly wasn't landing on the right part of the image.
const BG_IMAGE_ASPECT = 1806 / 871; // height / width

export default function QiblaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const [coords, setCoords] = useState<ResolvedCoordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>('Current location');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [heading, setHeading] = useState<HeadingReading | null>(null);
  const [headingError, setHeadingError] = useState<string | null>(null);

  // Calibration overlay: shown when first reading arrives at low accuracy,
  // or when accuracy drops back to low mid-use after being good.
  const [showCalibrationOverlay, setShowCalibrationOverlay] = useState(false);
  const hadGoodAccuracy = useRef(false);

  // Instability detection: track last 8 headings; if std dev > 15° the
  // needle is visibly jumping — likely magnetic interference nearby.
  const headingHistory = useRef<number[]>([]);
  const [isUnstable, setIsUnstable] = useState(false);

  const rotation = useRef(new Animated.Value(0)).current;

  // resolve location the same way Home does: whatever the user already has
  // configured (manual city or GPS), not a fresh separate ask.
  useEffect(() => {
    (async () => {
      const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
      const settings = await loadPrayerSettings(regionCode);
      if (settings.locationMode === 'manual' && settings.manualCity) {
        setCoords(settings.manualCity);
        setLocationLabel(settings.manualCity.label);
        return;
      }
      const gps = await resolveGpsCoordinates();
      if (gps) {
        setCoords(gps);
        setLocationLabel('Current location');
      } else {
        setLocationError('Location unavailable — open Home first to set a city.');
      }
    })();
  }, []);

  // live heading subscription
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    (async () => {
      const result = await getCurrentHeading();
      if (result.status === 'permission-denied') {
        setHeadingError('Location permission needed for the compass — grant it and reopen this screen. (This is separate from prayer-time location, which can use a searched city without ever granting live location access.)');
        return;
      }
      if (result.status === 'error') {
        setHeadingError(`Compass error: ${result.message}`);
        return;
      }

      const handleReading = (r: HeadingReading) => {
        setHeading(r);

        // Calibration overlay logic
        if (r.accuracy < 2) {
          if (!hadGoodAccuracy.current) {
            // First reading is poor — block the compass until calibrated
            setShowCalibrationOverlay(true);
          } else {
            // Was good, now dropped — show calibration prompt again
            setShowCalibrationOverlay(true);
            hadGoodAccuracy.current = false;
          }
        } else {
          hadGoodAccuracy.current = true;
          setShowCalibrationOverlay(false);
        }

        // Instability detection — circular mean variance over last 8 readings
        const hist = headingHistory.current;
        hist.push(r.trueHeading);
        if (hist.length > 8) hist.shift();
        if (hist.length >= 4) {
          const mean = hist.reduce((s, h) => s + h, 0) / hist.length;
          const variance = hist.reduce((s, h) => s + (h - mean) ** 2, 0) / hist.length;
          setIsUnstable(Math.sqrt(variance) > 15);
        }
      };

      handleReading(result.reading);
      sub = await watchHeading(handleReading);
    })();
    return () => sub?.remove();
  }, []);

  const bearing = coords ? qiblaBearing(coords.latitude, coords.longitude) : null;
  const relativeAngle = heading && bearing !== null ? relativeQiblaAngle(heading.trueHeading, bearing) : null;

  useEffect(() => {
    if (relativeAngle === null) return;
    Animated.timing(rotation, {
      toValue: relativeAngle,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [relativeAngle]);

  const lowAccuracy = heading !== null && heading.accuracy < 2;

  // Needle tip color: gold = high accuracy, amber = medium, red = low/none
  const needleTipColor =
    heading === null       ? GOLD :
    heading.accuracy >= 2  ? GOLD :
    heading.accuracy === 1 ? AMBER :
    RED;

  // Plain-language translation of relativeAngle — the raw numbers (Qibla
  // 19°, Heading 19°) require the user to do the subtraction themselves;
  // this is the actual answer they came here for.
  const ALIGNED_THRESHOLD_DEG = 5;
  const isAligned = relativeAngle !== null && Math.abs(relativeAngle) <= ALIGNED_THRESHOLD_DEG;
  const turnDirection: 'left' | 'right' = relativeAngle !== null && relativeAngle > 0 ? 'right' : 'left';
  const turnDegrees = relativeAngle !== null ? Math.round(Math.abs(relativeAngle)) : null;

  return (
    <View style={s.flex}>
      {/* full-bleed background, deliberately anchored to the bottom edge —
          full screen width, height computed from the real aspect ratio, so
          whatever sits at the BOTTOM of the source file is guaranteed to be
          what's visible at the bottom of the screen. Any excess height
          extends above the top of the screen, which is naturally clipped by
          the physical display boundary itself — no overflow:hidden needed. */}
      <Image
        source={require('../assets/compass.png')}
        style={[s.fullBg, { width: screenWidth, height: screenWidth * BG_IMAGE_ASPECT }]}
        resizeMode="cover"
      />

      <SafeAreaView style={s.safeArea} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Qibla Compass</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={s.content}>
        <TouchableOpacity
          style={s.locationChip}
          onPress={() => router.push('/(tabs)')}
          activeOpacity={0.75}
        >
          <Ionicons name="location-outline" size={14} color={GREEN} />
          <Text style={s.locationChipText} numberOfLines={1}>{locationLabel}</Text>
          <Ionicons name="pencil-outline" size={13} color={TEXT_MUTED} />
        </TouchableOpacity>

        {locationError && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={RED} />
            <Text style={s.errorText}>{locationError}</Text>
          </View>
        )}
        {headingError && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={RED} />
            <Text style={s.errorText}>{headingError}</Text>
          </View>
        )}

        {bearing !== null && heading !== null && (
          <>
            <View style={s.compassWrap}>
              <Image
                source={require('../assets/mandala.png')}
                style={s.mandala}
                resizeMode="contain"
              />

              {/* decorative tick marks — purely visual, not rotating (the arrow
                  is egocentric: it points toward Qibla relative to wherever the
                  phone currently points, not a true-north-anchored rose) */}
              {Array.from({ length: 24 }).map((_, i) => (
                <View
                  key={i}
                  style={[s.tickPivot, { transform: [{ rotate: `${i * 15}deg` }] }]}
                >
                  {/* Major ticks land at 0/90/180/270 only (i % 6 === 0) — a
                      fixed 45deg local rotation on top of those exact right
                      angles always renders as a proper diamond regardless of
                      which cardinal position it's at, since a square repeats
                      its appearance every 90deg. */}
                  {i % 6 === 0 ? <View style={s.tickDiamond} /> : <View style={s.tick} />}
                </View>
              ))}
              <Animated.View
                style={[
                  s.needleWrap,
                  {
                    transform: [
                      {
                        rotate: rotation.interpolate({
                          inputRange: [-180, 180],
                          outputRange: ['-180deg', '180deg'],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {/* Custom-built, not an icon glyph — a font icon's default
                    artwork orientation is unverified (likely angled, not
                    straight up), which would silently offset every rotation.
                    This shape's 0°-points-up geometry is guaranteed by
                    construction, same technique as the original working
                    version. Tip = direction to face; tail = counterweight. */}
                <View style={[s.needleTip, { borderBottomColor: needleTipColor }]} />
                <View style={s.needleTail} />
              </Animated.View>

              {/* fixed target marker — does not rotate. This is what you
                  align the needle tip against; the needle rotating alone,
                  with no fixed reference to align it to, was the reason the
                  first version gave no clear indication of the answer.
                  A plain pin for now — swap the icon inside for an actual
                  Kaaba glyph later if you get that asset. Using a static
                  icon here (not rotated) is safe — the "unverified default
                  orientation" risk from the needle only applies to rotated
                  elements, and location-pin icons pointing down are a very
                  standard, safe convention regardless. */}
              <View style={s.targetMarker}>
                <Ionicons name="location" size={30} color={DEEP_GREEN} />
              </View>
            </View>

            {relativeAngle !== null && (
              <View style={[s.statusBox, isAligned && s.statusBoxAligned]}>
                <Ionicons
                  name={
                    isAligned
                      ? 'checkmark-circle'
                      : turnDirection === 'right'
                        ? 'chevron-forward-circle-outline'
                        : 'chevron-back-circle-outline'
                  }
                  size={20}
                  color={isAligned ? GREEN : DEEP_GREEN}
                />
                <Text style={[s.statusText, isAligned && s.statusTextAligned]}>
                  {isAligned ? "You're facing Qibla" : `Turn ${turnDirection} ${turnDegrees}°`}
                </Text>
              </View>
            )}

            <View style={s.statsCard}>
              <View style={s.statBlock}>
                <Text style={s.statLabel}>Qibla</Text>
                <Text style={s.statValue}>{bearing.toFixed(0)}°</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBlock}>
                <Text style={s.statLabel}>Heading</Text>
                <Text style={s.statValue}>{heading.trueHeading.toFixed(0)}°</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBlock}>
                <Text style={s.statLabel}>Accuracy</Text>
                <Text style={[s.statValue, lowAccuracy && { color: AMBER }]}>
                  {ACCURACY_LABELS[heading.accuracy] ?? heading.accuracy}
                </Text>
              </View>
            </View>

            {lowAccuracy && !showCalibrationOverlay && (
              <View style={s.calibrateBox}>
                <Ionicons name="sync-outline" size={16} color={AMBER} />
                <Text style={s.calibrateHint}>
                  Move your phone in a figure-8 to improve accuracy.
                </Text>
              </View>
            )}

            {isUnstable && !lowAccuracy && (
              <View style={s.unstableBox}>
                <Ionicons name="warning-outline" size={16} color={RED} />
                <Text style={s.unstableHint}>
                  Compass is unstable — move away from metal objects, electronics, or magnetic cases.
                </Text>
              </View>
            )}
          </>
        )}

        {!bearing && !locationError && <Text style={s.meta}>Resolving location…</Text>}
        {bearing !== null && !heading && !headingError && <Text style={s.meta}>Waiting for compass…</Text>}
      </View>
      </SafeAreaView>

      {/* Blocking calibration overlay — shown on first load or after accuracy
          drops mid-use. Auto-dismisses when accuracy reaches 2+; user can
          also dismiss manually if they want to proceed anyway. */}
      {showCalibrationOverlay && (
        <View style={s.calibrationOverlay}>
          <View style={s.calibrationCard}>
            <View style={s.calibrationIconWrap}>
              <Ionicons name="sync-outline" size={36} color={AMBER} />
            </View>
            <Text style={s.calibrationTitle}>Compass Needs Calibration</Text>
            <Text style={s.calibrationBody}>
              Move your phone slowly in a figure-8 motion until the accuracy improves.
            </Text>
            <Text style={s.calibrationBody}>
              Keep away from metal surfaces, electronics, and magnetic phone cases.
            </Text>
            <View style={s.calibrationAccuracy}>
              <Text style={s.calibrationAccuracyLabel}>Current accuracy: </Text>
              <Text style={[s.calibrationAccuracyValue, { color: heading && heading.accuracy >= 1 ? AMBER : RED }]}>
                {heading ? ACCURACY_LABELS[heading.accuracy] : 'None'}
              </Text>
            </View>
            <TouchableOpacity
              style={s.calibrationDismiss}
              onPress={() => setShowCalibrationOverlay(false)}
            >
              <Text style={s.calibrationDismissText}>Proceed anyway</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  fullBg: { position: 'absolute', bottom: 0, left: 0 },
  safeArea: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT_DARK },

  content: { flex: 1, alignItems: 'center', padding: 20, paddingTop: 8 },

  locationChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center',
    backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  locationChipText: { fontSize: 13, fontWeight: '600', color: TEXT_DARK, maxWidth: 200 },

  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FDF2F1', borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#F3C6C2',
  },
  errorText: { flex: 1, fontSize: 13, color: RED, lineHeight: 18 },

  compassWrap: {
    width: 240, height: 240, borderRadius: 120,
    borderWidth: 1, borderColor: HAIRLINE,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24, backgroundColor: '#fff', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  mandala: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100, opacity: 0.35,
  },
  // Full-circle-sized invisible container, absolutely positioned to exactly
  // overlay compassWrap — rotating THIS (not the small tick itself) pivots
  // around the true center of the circle, so the tick fans out radially
  // instead of just spinning in place around its own tiny center.
  tickPivot: {
    position: 'absolute', width: 240, height: 240, alignItems: 'center',
  },
  tick: { width: 2, height: 10, backgroundColor: HAIRLINE, marginTop: 8 },
  tickDiamond: {
    width: 8, height: 8, backgroundColor: GOLD, marginTop: 6,
    transform: [{ rotate: '45deg' }],
  },

  // Two-tone needle: gold tip (points up = 0°, by construction) over a
  // dark-green tail, the same border-triangle technique the original
  // working arrow used — verified to point up at rest, unlike a font icon.
  needleWrap: { alignItems: 'center', justifyContent: 'center' },
  needleTip: {
    width: 0, height: 0,
    borderLeftWidth: 12, borderRightWidth: 12, borderBottomWidth: 68,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: GOLD,
  },
  needleTail: {
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 38,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: DEEP_GREEN,
  },

  // fixed marker at 12 o'clock — never rotates, this is the target the
  // needle tip should line up against
  targetMarker: { position: 'absolute', top: -4 },

  statusBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch',
    justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 12, marginBottom: 16,
    borderWidth: 1.5, borderColor: HAIRLINE,
  },
  statusBoxAligned: { backgroundColor: '#EFF6F1', borderColor: '#C6E8D6' },
  statusText: { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  statusTextAligned: { color: GREEN },

  statsCard: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    backgroundColor: '#fff', borderRadius: 18, paddingVertical: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  statBlock: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: HAIRLINE },
  statLabel: { fontSize: 11, fontWeight: '600', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '800', color: TEXT_DARK, fontVariant: ['tabular-nums'] },

  calibrateBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FBF3E6', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#EEDCB8',
  },
  calibrateHint: { flex: 1, fontSize: 13, color: AMBER, lineHeight: 18 },

  unstableBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FDF2F1', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#F3C6C2',
  },
  unstableHint: { flex: 1, fontSize: 13, color: RED, lineHeight: 18 },

  meta: { fontSize: 14, color: TEXT_MUTED },

  // Calibration overlay
  calibrationOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 24,
  },
  calibrationCard: {
    backgroundColor: CREAM, borderRadius: 24,
    padding: 28, alignItems: 'center', width: '100%',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 16,
  },
  calibrationIconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#FBF3E6',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  calibrationTitle: {
    fontSize: 18, fontWeight: '800', color: TEXT_DARK,
    textAlign: 'center', marginBottom: 12,
  },
  calibrationBody: {
    fontSize: 14, color: TEXT_MUTED, textAlign: 'center',
    lineHeight: 20, marginBottom: 8,
  },
  calibrationAccuracy: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 8, marginBottom: 20,
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: HAIRLINE,
  },
  calibrationAccuracyLabel: { fontSize: 13, color: TEXT_MUTED, fontWeight: '500' },
  calibrationAccuracyValue: { fontSize: 13, fontWeight: '700' },
  calibrationDismiss: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 8 },
  calibrationDismissText: { fontSize: 13, color: TEXT_MUTED, textDecorationLine: 'underline' },
});
