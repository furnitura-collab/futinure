/** Ilova ochadigan admin panel (EAS muhitida; eas update eas.json'dagi env'ni o'qimaydi) */
export const ADMIN_URL = (process.env.EXPO_PUBLIC_ADMIN_URL ?? 'https://mebel-admin.vercel.app').replace(/\/$/, '');

const ORIGIN = new URL(ADMIN_URL).origin;

/** Admin ichidagi sahifa — WebView'da; qolgani (tel:, xarita, boshqa sayt) — telefonning o'z ilovasida */
export const isInternal = (url: string) => url.startsWith(ORIGIN) || url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:');
