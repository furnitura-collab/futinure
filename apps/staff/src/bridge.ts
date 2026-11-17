import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** apps/admin/src/lib/native.ts bilan bir xil shartnoma */
type NativeMessage = { type: 'download'; filename: string; mime: string; base64: string } | { type: 'print'; html: string };

const isMessage = (v: unknown): v is NativeMessage =>
  typeof v === 'object' && v !== null && ((v as NativeMessage).type === 'download' || (v as NativeMessage).type === 'print');

/** Faylni keshga yozib "Ulashish" oynasi (saqlash, Telegram, Excel…); chop etish — tizim oynasi */
export async function handleNativeMessage(raw: string): Promise<void> {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isMessage(msg)) return;
  if (msg.type === 'print') {
    await Print.printAsync({ html: msg.html });
    return;
  }
  const file = new File(Paths.cache, msg.filename.replace(/[\\/:*?"<>|]/g, '_'));
  if (file.exists) file.delete();
  file.create();
  file.write(msg.base64, { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, { mimeType: msg.mime, dialogTitle: msg.filename });
}
