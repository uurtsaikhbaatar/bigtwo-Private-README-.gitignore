import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY_NAME = 'bigtwo.name';
const KEY_SERVER = 'bigtwo.server';
const KEY_SESSION = 'bigtwo.session';

/**
 * Вэб дээр суудлыг таб тус бүрээр тусад нь хадгална.
 *
 * AsyncStorage нь вэб дээр localStorage ашигладаг тул нэг браузерын бүх таб
 * ижил суудлыг хуваалцаж, хоёр тоглогчоор турших боломжгүй болно.
 * sessionStorage нь таб тус бүрд тусдаа боловч дахин ачаалахад хадгалагдана.
 */
const tabScoped = (): Storage | null => {
  if (Platform.OS !== 'web') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export interface SavedSession {
  code: string;
  playerId: string;
  token: string;
}

const read = async (key: string): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = async (key: string, value: string | null): Promise<void> => {
  try {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, value);
  } catch {
    // Хадгалалт бүтэлгүйтвэл тоглоом ажиллахад саад болохгүй.
  }
};

export const loadName = () => read(KEY_NAME);
export const saveName = (name: string) => write(KEY_NAME, name);

export const loadServer = () => read(KEY_SERVER);
export const saveServer = (url: string) => write(KEY_SERVER, url);

export async function loadSession(): Promise<SavedSession | null> {
  const tab = tabScoped();
  const raw = tab ? tab.getItem(KEY_SESSION) : await read(KEY_SESSION);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedSession;
    return parsed?.code && parsed?.playerId && parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveSession(s: SavedSession): Promise<void> {
  const tab = tabScoped();
  if (tab) tab.setItem(KEY_SESSION, JSON.stringify(s));
  else await write(KEY_SESSION, JSON.stringify(s));
}

export async function clearSession(): Promise<void> {
  const tab = tabScoped();
  if (tab) tab.removeItem(KEY_SESSION);
  else await write(KEY_SESSION, null);
}
