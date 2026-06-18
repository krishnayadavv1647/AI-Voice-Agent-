export default function Section({ title, description, action, children, className = "" }) {
  return (
    <section className={`section ${className}`}>
      {(title || description || action) && (
        <div className="section-header">
          <div className="min-w-0">
            {title && <h2 className="section-title">{title}</h2>}
            {description && <p className="section-description">{description}</p>}
          </div>
          {action && <div className="section-actions">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
