/**
 * Web stub for the map screen.
 * react-native-maps is native-only; this stub is shown on web.
 */

import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand } from '../lib/theme';

export default function MapScreenWeb() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.center}>
        <Text style={styles.text}>Map view is not available on web.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: Brand.textMuted, fontSize: 14 },
});
