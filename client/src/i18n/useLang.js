import { useSyncExternalStore } from 'react';
import { getLang, onLangChange } from './index.js';

// The current language, re-rendering the component when it changes.
export const useLang = () => useSyncExternalStore(onLangChange, getLang, getLang);
