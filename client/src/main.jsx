// Entry point: applies the saved theme, sets up the Android app's back button
// and status bar (no-op on the web), then renders the app inside the router
// and the auth provider.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { initTheme } from './theme.js';
import { initNative } from './native.js';
import './styles/index.css';

initNative();
initTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
