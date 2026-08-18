import { useRef, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';

// The app is deliberately a thin WebView around the SAME page the desktop and
// phone browsers load. That is not laziness: the fingerprint SDK reads canvas,
// WebGL, audio and navigator — APIs that exist only in a web engine, not in
// React Native. A "native" fingerprint client would have nothing to measure.
//
// It must load over https from a real origin. A page loaded from local app
// assets (file://) sends `Origin: null`, which the ingest cannot parse, and
// every identify would 403 at apps/ingest/src/middleware/origin.ts.
const PAGE_URL = 'https://fingerprint-admin.maxwinvault.xyz/sim/';

export default function App() {
  const webview = useRef(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(null);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.bar}>
        <Text style={styles.title}>fpclone sim</Text>
        <Pressable onPress={() => webview.current?.reload()} hitSlop={12}>
          <Text style={styles.reload}>reload</Text>
        </Pressable>
      </View>

      {failure ? (
        <View style={styles.center}>
          <Text style={styles.error}>{failure}</Text>
          <Text style={styles.hint}>{PAGE_URL}</Text>
        </View>
      ) : (
        <WebView
          ref={webview}
          source={{ uri: PAGE_URL }}
          onLoadEnd={() => setLoading(false)}
          // Surface transport failures instead of showing a blank white screen,
          // which is indistinguishable from "the page loaded but did nothing".
          onError={(e) => setFailure(e.nativeEvent.description ?? 'load failed')}
          onHttpError={(e) => setFailure(`HTTP ${e.nativeEvent.statusCode}`)}
          // Default WebView storage is per-app and persistent, which is what we
          // want: it mirrors a real embedded browser, and the visitorId must
          // still be stable without relying on any of it.
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['https://*']}
        />
      )}

      {loading && !failure ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color="#4c9aff" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d10' },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#252b36',
  },
  title: { color: '#e6e9ef', fontSize: 16, fontWeight: '700' },
  reload: { color: '#4c9aff', fontSize: 15 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#ff5c5c', fontSize: 16, marginBottom: 8, paddingHorizontal: 24, textAlign: 'center' },
  hint: { color: '#8b95a7', fontSize: 12, paddingHorizontal: 24, textAlign: 'center' },
});
