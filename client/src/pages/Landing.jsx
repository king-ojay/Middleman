import { Button, Card, LogoMark, PageLayout } from '../components/ui/index.js';
import TrustGraphMark from '../components/TrustGraphMark.jsx';

const steps = [
  { title: 'Post what you need done', body: 'Describe the job and name your price. Takes under a minute.' },
  { title: 'See who your network trusts', body: 'Workers someone you know has hired and vouched for come first.' },
  { title: 'Pay when the job is done', body: 'Agree the price up front and confirm the work before the money moves.' }
];

export default function Landing() {
  return (
    <PageLayout>
      <div className="flex items-center gap-3 mb-10">
        <LogoMark size={36} />
        <span className="text-title text-forest">Middleman</span>
      </div>

      <h1 className="text-display tracking-tight text-ink">Find someone trusted by people you trust.</h1>
      <p className="text-body text-muted mt-3">Agree a fair price and pay safely when the job is done.</p>

      <div className="mt-8 space-y-3">
        <Button to="/login">Get started</Button>
      </div>

      <section className="mt-10 bg-forest rounded-hero p-6">
        <TrustGraphMark className="w-full h-auto" />
        <p className="text-body text-white mt-4">
          You invited Amina. Amina hired Eric and rated him highly.
        </p>
        <p className="text-small text-mint mt-1">Eric now ranks higher for you, even though you have never met him.</p>
      </section>

      <section className="mt-10">
        <h2 className="text-section text-ink mb-4">How it works</h2>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <Card as="li" key={s.title} className="flex gap-4">
              <span className="w-11 h-11 shrink-0 rounded-full bg-mint text-forest text-card flex items-center justify-center">{i + 1}</span>
              <div>
                <h3 className="text-card text-ink">{s.title}</h3>
                <p className="text-body text-muted mt-1">{s.body}</p>
              </div>
            </Card>
          ))}
        </ol>
      </section>
    </PageLayout>
  );
}
