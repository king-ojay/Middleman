import { Link } from 'react-router-dom';
import TrustGraphMark from '../components/TrustGraphMark.jsx';

const steps = [
  {
    n: '1',
    title: 'Post what you need done',
    body: 'Describe the job — a leaking pipe, a wiring fault, a wall that needs plastering. Takes under a minute.'
  },
  {
    n: '2',
    title: 'See who your network trusts',
    body: "Workers aren't ranked by strangers' opinions. If someone you've hired before vouches for them, they rank first."
  },
  {
    n: '3',
    title: 'Pay through escrow, not on trust alone',
    body: 'Funds are held until the job is confirmed done. Neither side has to go first.'
  }
];

export default function Landing() {
  return (
    <>
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-20 grid md:grid-cols-[1.2fr_0.8fr] gap-12 items-center">
        <div>
          <h1 className="font-display text-4xl md:text-5xl leading-tight text-ink">
            Trust that travels, not ratings that average.
          </h1>
          <p className="mt-6 text-lg text-ink/70 max-w-md leading-relaxed">
            In Kigali, you already trust a mason because someone you know hired him.
            Middleman makes that reach further — without turning it into a stranger's
            star rating.
          </p>
          <div className="mt-8 flex gap-4">
            <Link to="/discover" className="px-5 py-3 bg-steel text-paper rounded font-medium hover:bg-steel-dark transition-colors">
              Find a worker
            </Link>
            <Link to="/post-job" className="px-5 py-3 border border-ink/20 rounded font-medium hover:border-ink/40 transition-colors">
              Post a job
            </Link>
          </div>
        </div>
        <div className="border border-ink/10 rounded bg-white/40 p-6">
          <TrustGraphMark className="w-full h-auto" />
          <p className="mt-3 text-xs text-ink/50 leading-relaxed">
            You've hired Amina before. Amina rated Eric well on a past job.
            Eric now ranks higher for you — even though you've never met him.
          </p>
        </div>
      </section>

      <section className="border-t border-ink/10 bg-white/30">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl text-ink mb-10">How it works</h2>
          <div className="grid md:grid-cols-3 gap-10">
            {steps.map(s => (
              <div key={s.n} className="flex gap-4">
                <span className="font-display text-3xl text-sisal shrink-0">{s.n}</span>
                <div>
                  <h3 className="font-medium text-ink mb-1">{s.title}</h3>
                  <p className="text-sm text-ink/60 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
