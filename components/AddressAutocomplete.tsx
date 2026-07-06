import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { fetchWithTimeout } from '../lib/errors';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../lib/theme';

const CREAM = Brand.cream;
const GREEN = Brand.green;
const RED   = Brand.red;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

export interface AddressSuggestion {
  displayName: string;
  lat: number;
  lng: number;
}

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  focused?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  returnKeyType?: TextInput['props']['returnKeyType'];
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput>;
}

export default function AddressAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder = 'Start typing an address…',
  focused,
  onFocus,
  onBlur,
  returnKeyType,
  onSubmitEditing,
  inputRef,
}: Props) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [searchError, setSearchError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef(false); // prevents re-search after selection

  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current = false;
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        const url =
          `https://nominatim.openstreetmap.org/search` +
          `?q=${encodeURIComponent(trimmed)}&format=json&limit=5&addressdetails=1`;

        const res = await fetchWithTimeout(url, {
          headers: { 'User-Agent': 'HalalForMe/1.0' },
        });
        const json = await res.json();

        setSuggestions(
          (json as any[]).map(item => ({
            displayName: item.display_name as string,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          })),
        );
      } catch {
        setSuggestions([]);
        setSearchError(true);
      } finally {
        setSearching(false);
      }
    }, 600); // 600 ms debounce — respects Nominatim's 1 req/sec limit

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const handleSelect = (s: AddressSuggestion) => {
    selectedRef.current = true;
    setSuggestions([]);
    onChangeText(s.displayName);
    onSelect(s);
  };

  return (
    <View>
      <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={text => { onChangeText(text); }}
          placeholder={placeholder}
          placeholderTextColor={TEXT_MUTED}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        {searching && <ActivityIndicator size="small" color={GREEN} style={styles.spinner} />}
        {!searching && value.length > 0 && (
          <TouchableOpacity
            onPress={() => { onChangeText(''); setSuggestions([]); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.clearBtn}
          >
            <Ionicons name="close-circle" size={16} color={TEXT_MUTED} />
          </TouchableOpacity>
        )}
      </View>

      {searchError && (
        <Text style={styles.searchErrorText}>
          Address lookup unavailable. Check your connection and try again.
        </Text>
      )}

      {suggestions.length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={suggestions}
            keyExtractor={(_, i) => String(i)}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[
                  styles.suggestion,
                  index < suggestions.length - 1 && styles.suggestionBorder,
                ]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="location-outline" size={14} color={GREEN} style={styles.pinIcon} />
                <Text style={styles.suggestionText} numberOfLines={2}>
                  {item.displayName}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 10,
    backgroundColor: CREAM, paddingHorizontal: 12,
  },
  inputRowFocused: { borderColor: GREEN, backgroundColor: '#fff' },
  input: { flex: 1, paddingVertical: 12, fontSize: 14, color: TEXT_DARK },
  spinner:  { marginLeft: 8 },
  clearBtn: { marginLeft: 6 },

  dropdown: {
    borderWidth: 1, borderColor: HAIRLINE, borderRadius: 10,
    backgroundColor: '#fff', marginTop: 4,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
    zIndex: 999,
  },
  suggestion: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 11,
  },
  suggestionBorder: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  pinIcon: { marginRight: 8, marginTop: 1 },
  suggestionText: { flex: 1, fontSize: 13, color: TEXT_DARK, lineHeight: 18 },
  searchErrorText: { fontSize: 12, color: RED, marginTop: 6, paddingHorizontal: 2 },
});
