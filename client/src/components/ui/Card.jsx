// Surface card: rounded, shadowed container used for every list item and panel.
export default function Card({ as: Tag = 'div', className = '', ...props }) {
  return <Tag className={`bg-surface rounded-card shadow-card p-4 ${className}`} {...props} />;
}
