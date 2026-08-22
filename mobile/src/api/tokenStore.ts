import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { TokenPair } from '@/types';

const ACCESS_TOKEN_KEY = 'docdo.access-token.v1';
const REFRESH_TOKEN_KEY = 'docdo.refresh-token.v1';

let accessTokenCache: string | null = null;
let refreshTokenCache: string | null = null;

function webSessionStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

async function readToken(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return webSessionStorage()?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function writeToken(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    webSessionStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteToken(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    webSessionStorage()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function loadTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  if (accessTokenCache && refreshTokenCache) {
    return { accessToken: accessTokenCache, refreshToken: refreshTokenCache };
  }
  const [accessToken, refreshToken] = await Promise.all([
    readToken(ACCESS_TOKEN_KEY),
    readToken(REFRESH_TOKEN_KEY),
  ]);
  accessTokenCache = accessToken;
  refreshTokenCache = refreshToken;
  return { accessToken, refreshToken };
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  accessTokenCache = tokens.access_token;
  refreshTokenCache = tokens.refresh_token;
  await Promise.all([
    writeToken(ACCESS_TOKEN_KEY, tokens.access_token),
    writeToken(REFRESH_TOKEN_KEY, tokens.refresh_token),
  ]);
}

export async function clearTokens(): Promise<void> {
  accessTokenCache = null;
  refreshTokenCache = null;
  await Promise.all([
    deleteToken(ACCESS_TOKEN_KEY),
    deleteToken(REFRESH_TOKEN_KEY),
  ]);
}
