import Svg, { Path, Rect, Circle } from 'react-native-svg';

/**
 * Inline Instagram brand icon — replaces `<Ionicons name="logo-instagram">` which
 * renders a broken .notdef glyph in the Ionicons font bundled with
 * @expo/vector-icons@15 due to a glyph-map / font-file mismatch.
 */
export function InstagramIcon({ size = 16, color = '#C13584' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Outer rounded square */}
      <Rect x="2" y="2" width="20" height="20" rx="5.5" ry="5.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Lens circle */}
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth="2" />
      {/* Top-right dot */}
      <Circle cx="17.5" cy="6.5" r="1" fill={color} />
    </Svg>
  );
}
