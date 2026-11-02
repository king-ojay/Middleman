// Surface card: rounded, shadowed container used for every list item and panel.
// The default p-4 is left out when the caller sets its own padding (p-0, p-5…):
// two padding utilities on one element resolve by stylesheet order, not by
// which one was written last, so p-4 used to beat p-0.
export default function Card({ as: Tag = 'div', className = '', ...props }) {
  const padding = /(^|\s)p-/.test(className) ? '' : 'p-4 ';
  return <Tag className={`bg-surface rounded-card shadow-card ${padding}${className}`} {...props} />;
}
