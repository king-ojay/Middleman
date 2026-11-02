import { LogoMark, PageLayout } from './ui/index.js';
import TrustGraphMark from './TrustGraphMark.jsx';

// Log in, sign up and PIN reset. Phones and tablets: one column. From 1024px
// the page fills the screen: the trust picture on a brand panel on the left
// (it stays in place while a long form scrolls) and the form on the right.
// The panel repeats the landing page's words; it adds no new copy.
export default function AuthLayout({ children, ...layout }) {
  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start">
      <aside className="hidden lg:flex lg:sticky lg:top-0 lg:h-dvh flex-col justify-center gap-10 bg-brand px-10 xl:px-16 py-12">
        <div className="flex items-center gap-3">
          {/* the navy mark needs a light tile on the navy panel */}
          <span className="w-12 h-12 rounded-2xl bg-surface flex items-center justify-center">
            <LogoMark size={32} />
          </span>
          <span className="text-title text-white">Middleman</span>
        </div>
        <div className="max-w-lg">
          <p className="text-display tracking-tight text-white">Find someone trusted by people you trust.</p>
          <p className="text-body text-on-brand-soft mt-3">Agree a fair price and pay safely when the job is done.</p>
        </div>
        <div className="max-w-lg">
          <TrustGraphMark className="w-full h-auto" />
          <p className="text-body text-white mt-4">You invited Amina. Amina hired Eric and rated him highly.</p>
          <p className="text-small text-on-brand-soft mt-1">Eric now ranks higher for you, even though you have never met him.</p>
        </div>
      </aside>
      <div className="lg:min-h-dvh lg:flex lg:flex-col lg:justify-center">
        <PageLayout {...layout}>{children}</PageLayout>
      </div>
    </div>
  );
}
