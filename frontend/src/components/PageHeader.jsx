export default function PageHeader({ title, description, action, breadcrumb }) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        {breadcrumb && <p className="page-breadcrumb">{breadcrumb}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  );
}
