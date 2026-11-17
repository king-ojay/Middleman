// The Android app (Capacitor): the built client (dist/) is bundled into the
// APK and served by the WebView from https://localhost, which is the origin
// the API sees (CORS_ORIGINS). Build with `npm run android:build` for the
// live API, or `npm run android:build:local` for an API on this computer.
//
// CAP_TARGET=local (set by android:build:local) lets the app call a plain
// http:// API such as http://10.0.2.2:4000 (the emulator's name for this
// computer). It is never set for the live build, which only talks HTTPS.
import type { CapacitorConfig } from '@capacitor/cli';

const local = process.env.CAP_TARGET === 'local';

const config: CapacitorConfig = {
  appId: 'rw.middleman.app',
  appName: 'Middleman',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(local ? { cleartext: true } : {})
  },
  android: {
    allowMixedContent: local
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: '#111827',
      showSpinner: false
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover'
    }
  }
};

export default config;
