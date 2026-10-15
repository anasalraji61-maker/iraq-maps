/**
 * Internal store for read receipts — shared between useReadReceipts and useUnreadCount.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECEIPTS_KEY = '@iraq-maps/messages/read-receipts';

export interface ReadReceipts {
  [inquiryId: string]: string; // ISO timestamp
}

export async function loadReceipts(): Promise<ReadReceipts> {
  try {
    const raw = await AsyncStorage.getItem(RECEIPTS_KEY);
    return raw ? (JSON.parse(raw) as ReadReceipts) : {};
  } catch {
    return {};
  }
}

export async function saveReceipts(receipts: ReadReceipts): Promise<void> {
  try {
    await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts));
  } catch {
    // best-effort
  }
}
