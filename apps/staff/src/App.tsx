import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { WebViewNavigation } from 'react-native-webview';
import { handleNativeMessage } from './bridge';
import { LoadBar } from './LoadBar';
import { ADMIN_URL, isInternal } from './config';
import { Offline } from './Offline';
import { PALETTE } from './palette';
import { WebFrame, type WebFrameHandle } from './WebFrame';

void SplashScreen.preventAutoHideAsync();

/**
 * Xodim ilovasi: admin panelning o'zi (telefonga moslashtirilgan) — barcha funksiyalar bitta koddan.
 * Native qism: orqaga tugmasi, tashqi havolalar, fayl ulashish va chop etish (bridge), tarmoq xatosi.
 */
export function App() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = PALETTE[scheme];
  const web = useRef<WebFrameHandle>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);

  // Android "orqaga": admin ichida oldingi sahifaga; eng boshida — ilovadan chiqish
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      web.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onNav = (nav: WebViewNavigation) => setCanGoBack(nav.canGoBack);
  const openOutside = (url: string) => {
    if (isInternal(url)) return true;
    void Linking.openURL(url);
    return false;
  };
  const retry = () => {
    setFailed(false);
    web.current?.reload();
  };

  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
        {failed ? (
          <Offline colors={colors} onRetry={retry} />
        ) : (
          <>
            <LoadBar progress={progress} color={colors.primary} />
            <WebFrame
              ref={web}
              source={{ uri: ADMIN_URL }}
              style={{ flex: 1, backgroundColor: colors.background }}
              applicationNameForUserAgent="MebelStaffApp"
              onNavigationStateChange={onNav}
              onShouldStartLoadWithRequest={(req) => openOutside(req.url)}
              onMessage={(e) => void handleNativeMessage(e.nativeEvent.data)}
              onLoadProgress={(e) => setProgress(e.nativeEvent.progress)}
              onLoadEnd={() => void SplashScreen.hideAsync()}
              onError={() => setFailed(true)}
              onHttpError={(e) => e.nativeEvent.statusCode >= 500 && setFailed(true)}
              allowFileAccess
              setSupportMultipleWindows={false}
              overScrollMode="never"
              textZoom={100}
            />
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
