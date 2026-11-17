import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API the Android app calls, by build mode (npm run android:build and
// android:build:local). VITE_API_URL set in the environment always wins, e.g.
// http://192.168.1.20:4000 for a phone on the same Wi-Fi as a local API.
// 10.0.2.2 is how the Android emulator reaches this computer.
const ANDROID_API = {
  android: 'https://middleman-api-74zb.onrender.com',
  'android-local': 'http://10.0.2.2:4000'
};

export default defineConfig(({ mode }) => {
  if (ANDROID_API[mode] && !process.env.VITE_API_URL) process.env.VITE_API_URL = ANDROID_API[mode];
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://localhost:4000'
      }
    }
  };
});
