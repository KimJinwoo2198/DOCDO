import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'docdo_onboarding_seen';

export async function hasSeenOnboarding() {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) === 'true';
  return (await SecureStore.getItemAsync(KEY)) === 'true';
}

export async function markOnboardingSeen() {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(KEY, 'true');
    return;
  }
  await SecureStore.setItemAsync(KEY, 'true');
}
