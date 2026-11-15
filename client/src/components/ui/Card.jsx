// Surface card: white, rounded, flat (no border, no heavy shadow) on the grey
// page; used for every list item and panel. The default p-4 is left out when
// the caller sets its own padding (p-0, p-5…): two padding utilities on one
// element resolve by stylesheet order, not by which one was written last.
export default function Card({ as: Tag = 'div', className = '', ...props }) {
  const padding = /(^|\s)p-/.test(className) ? '' : 'p-4 ';
  return <Tag className={`bg-surface rounded-card ${padding}${className}`} {...props} />;
}
