import { forwardRef, type ComponentType, type Ref } from 'react';
import { WebView } from 'react-native-webview';
import type { AndroidWebViewProps } from 'react-native-webview/lib/WebViewTypes';

/** Ilova faqat Android uchun yig'iladi; kutubxonaning umumiy tipi (iOS & Android & Windows) kesishmada `never` bo'lib qoladi */
export interface WebFrameHandle {
  goBack(): void;
  reload(): void;
}

const Native = WebView as unknown as ComponentType<AndroidWebViewProps & { ref?: Ref<WebFrameHandle> }>;

export const WebFrame = forwardRef<WebFrameHandle, AndroidWebViewProps>(function WebFrame(props, ref) {
  return <Native ref={ref} {...props} />;
});
