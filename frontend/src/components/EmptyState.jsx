export default function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-hairline bg-white p-8 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-neutral-100" />
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
