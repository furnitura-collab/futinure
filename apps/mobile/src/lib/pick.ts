import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

/** Yuklash uchun tanlangan fayl (webda `file` — Blob) */
export interface Picked {
  uri: string;
  name: string;
  mimeType: string;
  file?: Blob;
}

export async function pickImage(camera: boolean, quality = 0.7): Promise<Picked | null> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality };
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return null;
  const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = r.assets?.[0];
  return !r.canceled && a ? { uri: a.uri, name: a.fileName ?? 'rasm.jpg', mimeType: a.mimeType ?? 'image/jpeg', file: a.file } : null;
}

export async function pickPdf(): Promise<Picked | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
  const a = r.assets?.[0];
  return !r.canceled && a ? { uri: a.uri, name: a.name, mimeType: 'application/pdf', file: a.file } : null;
}
