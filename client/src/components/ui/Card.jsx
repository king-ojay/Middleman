export default function Card({ as: Tag = 'div', className = '', ...props }) {
  return <Tag className={`bg-white rounded-card shadow-card p-4 ${className}`} {...props} />;
}
