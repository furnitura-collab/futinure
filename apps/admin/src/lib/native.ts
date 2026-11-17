/**
 * Xodim ilovasi (apps/staff) — admin panel WebView ichida. Brauzerning yuklab olish (blob havola) va window.print
 * WebView'da ishlamaydi — ilovada ular native tomonga uzatiladi (fayl ulashish, chop etish oynasi).
 */
type NativeMessage = { type: 'download'; filename: string; mime: string; base64: string } | { type: 'print'; html: string };

interface Bridge {
  postMessage(data: string): void;
}

const bridge = () => (window as unknown as { ReactNativeWebView?: Bridge }).ReactNativeWebView;

export const inStaffApp = () => !!bridge();

function post(msg: NativeMessage) {
  bridge()?.postMessage(JSON.stringify(msg));
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function saveBlob(blob: Blob, filename: string) {
  if (inStaffApp()) {
    post({ type: 'download', filename, mime: blob.type || 'application/octet-stream', base64: await base64(blob) });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Brauzerda — window.print (@media print faqat #print-area); ilovada — shu blok HTML'i sahifa stillari bilan */
export function printElement(id: string) {
  const el = document.getElementById(id);
  if (!inStaffApp() || !el) return window.print();
  const css = Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules, (r) => r.cssText).join('\n');
      } catch {
        return '';
      }
    })
    .join('\n');
  post({ type: 'print', html: `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${el.outerHTML}</body></html>` });
}
