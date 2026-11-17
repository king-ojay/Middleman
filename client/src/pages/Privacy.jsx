// /privacy: the Privacy Policy & Terms, public (no login), with the language
// switch. Linked from the landing page, sign-up and the profile.
import { PageLayout } from '../components/ui/index.js';
import LanguageSwitch from '../components/LanguageSwitch.jsx';
import PrivacyPolicy from '../components/PrivacyPolicy.jsx';
import { t } from '../i18n/index.js';

export default function Privacy() {
  return (
    <PageLayout back title={t('privacy.title')} width="medium">
      <LanguageSwitch className="mb-6" />
      <PrivacyPolicy />
    </PageLayout>
  );
}
