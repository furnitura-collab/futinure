import { Platform } from 'react-native';

/**
 * API manzili. EXPO_PUBLIC_API_URL bo'lmasa — dev uchun taxmin:
 * Android emulator kompyuterni 10.0.2.2 orqali ko'radi, qolganlari localhost.
 */
const env = process.env.EXPO_PUBLIC_API_URL;

/** "same-origin" — web build API bilan bitta serverdan beriladi */
export const API_URL = (
  env === 'same-origin' && Platform.OS === 'web'
    ? window.location.origin
    : (env ?? (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000'))
).replace(/\/$/, '');

export const API_BASE = `${API_URL}/api/v1`;
