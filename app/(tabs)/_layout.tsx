import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GREEN = '#245737';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IoniconName, outlineName: IoniconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? name : outlineName} size={size} color={color as string} />
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const paddingBottom = insets.bottom + 4;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GREEN,
        tabBarInactiveTintColor: '#b0b0b0',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#f0f0f0',
          paddingBottom,
          height: 56 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Explore',
          tabBarIcon: tabIcon('compass', 'compass-outline'),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Scanner',
          tabBarIcon: tabIcon('scan', 'scan-outline'),
        }}
      />
      {/* Guides is no longer a bottom tab — it is now discoverable through
          the Explore screen. The route (/guides, /guide/[id], /guides/[cat])
          remains fully functional; only the tab bar entry is removed. */}
      <Tabs.Screen
        name="guides"
        options={{ href: null }}
      />
      {/* Community deliberately removed from the tab bar — deferred until
          there's real user activity to populate it (see the "keep it simple
          until there's a real content plan" decision). community.tsx and its
          backend (contribution_points, user_badges, leaderboard views) are
          left in place, not deleted, for when it's reintroduced. */}
      <Tabs.Screen
        name="community"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="campus"
        options={{
          title: 'Campus',
          tabBarIcon: tabIcon('school', 'school-outline'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: tabIcon('person', 'person-outline'),
        }}
      />
    </Tabs>
  );
}
