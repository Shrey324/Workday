import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { UserProfile } from '../../features/projects/types';

type Props = {
  label: string;
  query: string;
  placeholder: string;
  suggestions: UserProfile[];
  selected: UserProfile[];
  isSearching?: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (user: UserProfile) => void;
  onRemove: (userId: string) => void;
};

export function AccountPicker({
  label,
  query,
  placeholder,
  suggestions,
  selected,
  isSearching = false,
  onQueryChange,
  onSelect,
  onRemove,
}: Props) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={onQueryChange}
        placeholder={placeholder}
        placeholderTextColor="#A5A7AB"
        autoCapitalize="words"
        autoCorrect={false}
      />
      {query.trim().length > 0 && (
        <View style={styles.suggestions}>
          {isSearching ? (
            <Text style={styles.empty}>Searching signed-up users…</Text>
          ) : suggestions.length === 0 ? (
            <Text style={styles.empty}>
              {query.trim().length < 2
                ? 'Type at least 2 characters to search.'
                : 'No signed-up users found.'}
            </Text>
          ) : (
            suggestions.map((user) => (
              <Pressable
                key={user.id}
                onPress={() => onSelect(user)}
                style={styles.suggestion}
                accessibilityRole="button"
                accessibilityLabel={`Add ${user.fullName}`}
              >
                <Text style={styles.suggestionName}>{user.fullName}</Text>
                <Text style={styles.add}>Add</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
      {selected.length > 0 && (
        <View style={styles.selectedList}>
          {selected.map((user) => (
            <View key={user.id} style={styles.selected}>
              <Text style={styles.selectedName}>{user.fullName}</Text>
              <Pressable
                onPress={() => onRemove(user.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${user.fullName}`}
              >
                <Text style={styles.remove}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: '#54565A',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginBottom: 8,
  },
  input: {
    minHeight: 45,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E6E7',
    borderRadius: 8,
    color: '#202124',
    fontSize: 12,
    backgroundColor: '#FFFFFF',
  },
  suggestions: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#ECEDEF',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  suggestion: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F0',
  },
  suggestionName: {
    color: '#202124',
    fontSize: 11,
  },
  add: {
    color: '#17845D',
    fontSize: 10,
    fontWeight: '700',
  },
  empty: {
    color: '#777A80',
    fontSize: 10,
    padding: 11,
  },
  selectedList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  selected: {
    minHeight: 27,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 9,
    paddingRight: 5,
    borderRadius: 6,
    backgroundColor: '#F1F1F0',
  },
  selectedName: {
    color: '#202124',
    fontSize: 9,
  },
  remove: {
    color: '#777A80',
    fontSize: 15,
    paddingHorizontal: 3,
  },
});
