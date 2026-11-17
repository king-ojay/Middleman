// Public landing page: what Middleman does, and the way into signup and login.
import { useEffect } from 'react';
import { wakeApi } from '../api.js';
import { Link } from 'react-router-dom';
import { Button, Card, LogoMark, PageLayout } from '../components/ui/index.js';
import { TrustExample } from '../components/TrustGraphMark.jsx';
import LanguageSwitch from '../components/LanguageSwitch.jsx';
import { t } from '../i18n/index.js';

const STEPS = [1, 2, 3];

export default function Landing() {
  useEffect(wakeApi, []);
  return (
    <PageLayout width="wide">
      <div className="lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center lg:min-h-[70vh]">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
            <div className="flex items-center gap-3">
              <LogoMark size={36} />
              <span className="text-title text-ink">{t('app.name')}</span>
            </div>
            <LanguageSwitch />
          </div>

          <h1 className="text-display tracking-tight text-ink">{t('landing.headline')}</h1>
          <p className="text-body text-muted mt-3">{t('landing.sub')}</p>

          <div className="mt-8 space-y-3 max-w-sm">
            <Button to="/register">{t('landing.createAccount')}</Button>
            <Button to="/login" variant="outline">{t('landing.logIn')}</Button>
          </div>
        </div>

        <section className="mt-10 lg:mt-0 bg-brand rounded-hero p-6 md:p-8">
          <TrustExample markClassName="max-w-lg mx-auto" />
        </section>
      </div>

      <section className="mt-10">
        <h2 className="text-section text-ink mb-4">{t('landing.howItWorks')}</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {STEPS.map(n => (
            <Card as="li" key={n} className="flex gap-4">
              <span className="w-11 h-11 shrink-0 rounded-full bg-trust text-on-trust text-card flex items-center justify-center">{n}</span>
              <div>
                <h3 className="text-card text-ink">{t(`landing.step${n}.title`)}</h3>
                <p className="text-body text-muted mt-1">{t(`landing.step${n}.body`)}</p>
              </div>
            </Card>
          ))}
        </ol>
      </section>

      <footer className="mt-10">
        <Link to="/privacy" className="inline-flex items-center h-11 text-body text-muted underline hover:text-ink">{t('privacy.link')}</Link>
      </footer>
    </PageLayout>
  );
}