// The Android app (Capacitor) only; on the web every call here does nothing.
// - The phone's back button goes back a page inside the app, and only leaves
//   the app from the first page.
// - The status bar icons are dark on the light theme and light on the dark one
//   (the page draws behind the bar; the safe-area padding keeps text clear).
// Calls (tel:) and links to other sites leave the WebView on their own:
// Capacitor hands any address that isn't the app's to Android, which opens
// the dialler or the browser.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { onDarkChange } from './theme.js';

export const isNativeApp = () => Capacitor.isNativePlatform();

export function initNative() {
  if (!isNativeApp()) return;
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.exitApp();
  });
  onDarkChange(dark => {
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  });
}
