import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { colors, fontFamilies, layout, radii, shadows, sizes } from '@/theme';

const tabIcons: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  index: { active: 'home', inactive: 'home-outline' },
  documents: { active: 'documents', inactive: 'documents-outline' },
  care: { active: 'people', inactive: 'people-outline' },
};

export default function TabsLayout() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.actionPrimary} size="large" /></View>;
  }
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      detachInactiveScreens
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.actionPrimary,
        tabBarInactiveTintColor: colors.foregroundSecondary,
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: styles.tabItem,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ color, focused }) => {
          if (route.name === 'scan') {
            return (
              <View style={styles.scanButton}>
                <Ionicons color={colors.foregroundInverse} name="add" size={30} />
              </View>
            );
          }
          const icon = tabIcons[route.name] ?? tabIcons.index!;
          return <Ionicons color={color} name={focused ? icon.active : icon.inactive} size={22} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="documents" options={{ title: '문서' }} />
      <Tabs.Screen
        listeners={user.role === 'USER' ? { tabPress: (event) => { event.preventDefault(); router.push('/document/new'); } } : undefined}
        name="scan"
        options={user.role === 'USER' ? { title: '스캔' } : { href: null, title: '스캔' }}
      />
      <Tabs.Screen name="care" options={{ title: user.role === 'GUARDIAN' ? '보호' : '가족' }} />
      <Tabs.Screen name="profile" options={{ href: null, title: '설정' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: colors.backgroundPrimary, flex: 1, justifyContent: 'center' },
  tabBar: { backgroundColor: colors.backgroundPrimary, borderTopColor: colors.lineDefault, height: layout.tabBarHeight, paddingBottom: 8, paddingTop: 10 },
  tabItem: { minHeight: 56 },
  tabLabel: { fontFamily: fontFamilies.bold, fontSize: 11 },
  scanButton: { ...shadows.floating, alignItems: 'center', backgroundColor: colors.actionPrimary, borderRadius: radii.full, height: sizes.tabAction, justifyContent: 'center', marginTop: -28, width: sizes.tabAction },
});
