// STUB: form fields exist and match the Job model, but this doesn't submit
// to the API yet. Next thing to build after Discover is reviewed.
export default function PostJob() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-ink mb-2">Post a job</h1>
      <p className="text-ink/60 mb-8">Describe what you need done. Workers in your area will send quotes.</p>

      <form className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Category</label>
          <select className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60">
            <option>Electrician</option>
            <option>Mason</option>
            <option>Plumber</option>
            <option>Cleaner</option>
            <option>Mechanic</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Description</label>
          <textarea rows={4} className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60" placeholder="e.g. Kitchen tap is leaking, needs replacing" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Area</label>
          <select className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60">
            <option value="kimironko">Kimironko</option>
            <option value="kwa_nayinzira">Kwa Nayinzira</option>
          </select>
        </div>
        <button type="button" className="px-5 py-3 bg-steel text-paper rounded font-medium hover:bg-steel-dark transition-colors">
          Post job (not yet wired up)
        </button>
      </form>
    </div>
  );
}
