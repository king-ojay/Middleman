import { LANGUAGES, setLang, t } from '../i18n/index.js';
import { useLang } from '../i18n/useLang.js';
import { Chip } from './ui/index.js';

// "English / Kinyarwanda (beta)" on the landing page, log in and the profile.
// Each language is named in its own words, whichever is chosen. The choice is
// kept on this device (i18n/index.js). Hidden when only English is offered
// (VITE_ENABLE_KINYARWANDA=false).
export default function LanguageSwitch({ className = '' }) {
  const lang = useLang();
  if (LANGUAGES.length < 2) return null; // Kinyarwanda switched off: English only
  return (
    <div role="group" aria-label={t('language.label')} className={`flex flex-wrap gap-2 ${className}`}>
      {LANGUAGES.map(l => (
        <Chip key={l.value} lang={l.value} active={lang === l.value} onClick={() => setLang(l.value)}>{l.label}</Chip>
      ))}
    </div>
  );
}
