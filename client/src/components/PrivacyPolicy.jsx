import { POLICY_UPDATED, POLICY_VERSION } from '../policy.shared.js';
import { t } from '../i18n/index.js';

// The Privacy Policy & Terms, in the person's language (i18n "privacy.*"):
// shown on the public /privacy page and, during sign-up, in a sheet so the
// form isn't lost. POLICY_VERSION and POLICY_UPDATED come from
// shared/policy.js, the same values the server stores at sign-up.
export const CONTACT = 'o.attah@alustudent.com';

// '2026-11-17' -> "17 November 2026" ("17 Ugushyingo 2026").
const longDate = iso => {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${t(`month.${month}`)} ${year}`;
};

const Section = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="text-section text-ink mb-2">{title}</h2>
    {children}
  </section>
);
const List = ({ keys }) => (
  <ul className="list-disc pl-5 space-y-2 text-body text-ink">
    {keys.map(key => <li key={key}>{t(key)}</li>)}
  </ul>
);
const items = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);
const mail = subject => `mailto:${CONTACT}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
const linkClass = 'font-semibold text-ink underline break-words';

export default function PrivacyPolicy() {
  return (
    <div>
      <p className="text-small text-muted">{t('privacy.version', { version: POLICY_VERSION, date: longDate(POLICY_UPDATED) })}</p>
      <p className="text-body text-ink mt-3">{t('privacy.intro')}</p>

      <Section title={t('privacy.who.title')}>
        <p className="text-body text-ink">{t('privacy.who.body')}</p>
        <p className="text-body text-ink mt-2">{t('privacy.contact')} <a className={linkClass} href={mail()}>{CONTACT}</a></p>
      </Section>
      <Section title={t('privacy.collect.title')}>
        <List keys={items('privacy.collect', 4)} />
        <p className="text-body text-muted mt-3">{t('privacy.collect.not')}</p>
      </Section>
      <Section title={t('privacy.why.title')}><List keys={items('privacy.why', 4)} /></Section>
      <Section title={t('privacy.sees.title')}><List keys={items('privacy.sees', 5)} /></Section>
      <Section title={t('privacy.stored.title')}><p className="text-body text-ink">{t('privacy.stored.body')}</p></Section>
      <Section title={t('privacy.rights.title')}>
        <List keys={items('privacy.rights', 4)} />
        <p className="mt-3"><a className={linkClass} href={mail(t('privacy.deleteSubject'))}>{t('privacy.deleteLink')}</a></p>
      </Section>
      <Section title={t('privacy.security.title')}><p className="text-body text-ink">{t('privacy.security.body')}</p></Section>
      <Section title={t('privacy.payments.title')}><p className="text-body text-ink">{t('privacy.payments.body')}</p></Section>
      <Section title={t('privacy.age.title')}><p className="text-body text-ink">{t('privacy.age.body')}</p></Section>
      <Section title={t('privacy.rules.title')}><List keys={items('privacy.rules', 4)} /></Section>
      <p className="text-small text-muted mt-8">{t('privacy.changes')}</p>
    </div>
  );
}
