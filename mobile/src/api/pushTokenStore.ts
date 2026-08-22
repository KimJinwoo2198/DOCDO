import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PUSH_TOKEN_KEY = 'docdo.expo-push-token.v1';
let pushTokenCache: string | null = null;

export async function savePushToken(token: string): Promise<void> {
  pushTokenCache = token;
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
}

export async function loadPushToken(): Promise<string | null> {
  if (pushTokenCache) return pushTokenCache;
  if (Platform.OS === 'web') return null;
  pushTokenCache = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  return pushTokenCache;
}

export async function clearPushToken(): Promise<void> {
  pushTokenCache = null;
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}
