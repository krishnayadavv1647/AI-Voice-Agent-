export default function PageHeader({ title, description, action }) {
  return (
    <div className="mb-5 flex min-w-0 max-w-full flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-anywhere text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {action && <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:flex-wrap">{action}</div>}
    </div>
  );
}
