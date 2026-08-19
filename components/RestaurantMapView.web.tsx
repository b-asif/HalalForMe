/**
 * Web stub for RestaurantMapView.
 * react-native-maps is native-only and cannot run on web.
 * Metro picks this file automatically when bundling for web.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Brand } from '../lib/theme';

export interface MapPin {
  id: string;
  name: string;
  cuisine_type: string;
  lat: number | null;
  lng: number | null;
  avg_rating?: number | null;
  primary_certifier: string;
  category?: string;
}

interface Props {
  pins?: MapPin[];
  initialLat?: number;
  initialLng?: number;
  onPinPress?: (pin: MapPin) => void;
}

export default function RestaurantMapView(_props: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Map view is not available on web.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
  },
  text: {
    color: Brand.textMuted,
    fontSize: 14,
  },
});
