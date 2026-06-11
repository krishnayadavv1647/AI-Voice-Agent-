// app/ui.jsx — shared design-system primitives (warm theme, CSS vars from host)
const cx = (...a) => a.filter(Boolean).join(" ");

function Btn({ variant = "primary", size = "md", icon, iconRight, children, className = "", ...p }) {
  const sz = size === "sm" ? "h-9 px-3 text-[13px]" : size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-[14px]";
  const sq = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const only = !children;
  return (
    <button className={cx("ui-btn", "ui-" + variant, only ? sq + " px-0" : sz, className)} {...p}>
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 16 : 18} />}
    </button>
  );
}

function Card({ className = "", children, style, ...p }) {
  return <div className={cx("ui-card", className)} style={style} {...p}>{children}</div>;
}

const TONES = {
  ok: "ui-badge-ok", success: "ui-badge-ok", active: "ui-badge-ok", live: "ui-badge-ok", completed: "ui-badge-ok", connected: "ui-badge-ok", paid: "ui-badge-ok", interested: "ui-badge-ok", booked: "ui-badge-ok",
  warn: "ui-badge-warn", pending: "ui-badge-warn", draft: "ui-badge-warn", paused: "ui-badge-warn", contacted: "ui-badge-warn", trial: "ui-badge-warn", new: "ui-badge-info",
  danger: "ui-badge-danger", failed: "ui-badge-danger", error: "ui-badge-danger", overdue: "ui-badge-danger", "not interested": "ui-badge-danger", inactive: "ui-badge-muted",
  info: "ui-badge-info", queued: "ui-badge-info", scheduled: "ui-badge-info", muted: "ui-badge-muted", offline: "ui-badge-muted",
};
function Badge({ tone, children, dot }) {
  const key = (tone || String(children || "")).toLowerCase();
  const cls = TONES[key] || "ui-badge-muted";
  return <span className={cx("ui-badge", cls)}>{dot && <span className="ui-dot" />}{children}</span>;
}

function Avatar({ name = "", src, size = 38, tone }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const hues = ["var(--accent)", "#8a5a2b", "#5b7c5a", "#9a6b8a", "#6b7c9a", "#a8763a"];
  const bg = tone || hues[(name.charCodeAt(0) || 0) % hues.length];
  return src ? (
    <img src={src} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
  ) : (
    <span className="grid place-items-center font-bold text-white shrink-0" style={{ width: size, height: size, borderRadius: "50%", background: bg, fontSize: size * 0.36 }}>{initials}</span>
  );
}

function PageHead({ title, desc, actions, tabs, tab, onTab }) {
  return (
    <div className="mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] sm:text-[30px] font-extrabold tracking-tight" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>{title}</h1>
          {desc && <p className="mt-1 text-[14.5px] max-w-2xl" style={{ color: "var(--muted)" }}>{desc}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
      </div>
      {tabs && <Tabs tabs={tabs} value={tab} onChange={onTab} className="mt-5" />}
    </div>
  );
}

function Tabs({ tabs, value, onChange, className = "" }) {
  return (
    <div className={cx("ui-tabs", className)}>
      {tabs.map((t) => {
        const v = typeof t === "object" ? t.value : t;
        const l = typeof t === "object" ? t.label : t;
        return <button key={v} className={cx("ui-tab", value === v && "ui-tab-on")} onClick={() => onChange?.(v)}>{l}</button>;
      })}
    </div>
  );
}

function Segmented({ options, value, onChange, className = "" }) {
  return (
    <div className={cx("ui-seg", className)}>
      {options.map((o) => {
        const v = typeof o === "object" ? o.value : o;
        const l = typeof o === "object" ? o.label : o;
        return <button key={v} className={cx("ui-seg-btn", value === v && "ui-seg-on")} onClick={() => onChange?.(v)}>{l}</button>;
      })}
    </div>
  );
}

function Field({ label, hint, required, children, className = "" }) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="flex items-center gap-1 text-[13px] font-bold mb-1.5" style={{ color: "var(--text)" }}>{label}{required && <span style={{ color: "var(--accent)" }}>*</span>}</span>}
      {children}
      {hint && <span className="block text-[12px] mt-1.5" style={{ color: "var(--muted)" }}>{hint}</span>}
    </label>
  );
}
const Input = (p) => <input className={cx("ui-input", p.className)} {...{ ...p, className: undefined }} />;
const Textarea = (p) => <textarea className={cx("ui-input", p.className)} {...{ ...p, className: undefined }} />;
function Select({ options = [], className, ...p }) {
  return <select className={cx("ui-input ui-select", className)} {...p}>{options.map((o) => { const v = typeof o === "object" ? o.value : o; const l = typeof o === "object" ? o.label : o; return <option key={v} value={v}>{l}</option>; })}</select>;
}
function Toggle({ checked, onChange }) {
  return <button type="button" className={cx("ui-toggle", checked && "ui-toggle-on")} onClick={() => onChange?.(!checked)}><i /></button>;
}

function StatCard({ label, value, icon, trend, trendDir = "up", sub }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <span className="ui-iconbox"><Icon name={icon} size={20} /></span>
        {trend && <span className={cx("ui-trend", trendDir === "down" && "ui-trend-down")}><Icon name={trendDir === "down" ? "trendDown" : "trendUp"} size={13} />{trend}</span>}
      </div>
      <p className="text-[13.5px] font-semibold" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="mt-1 text-[28px] font-extrabold tracking-tight" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>{value}</p>
      {sub && <p className="mt-1 text-[12.5px]" style={{ color: "var(--muted)" }}>{sub}</p>}
    </Card>
  );
}

function EmptyState({ icon = "sparkle", title, desc, action }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      <span className="ui-iconbox" style={{ width: 56, height: 56, borderRadius: 18 }}><Icon name={icon} size={26} /></span>
      <h3 className="mt-4 text-[17px] font-bold" style={{ color: "var(--text)" }}>{title}</h3>
      {desc && <p className="mt-1.5 text-[14px] max-w-sm" style={{ color: "var(--muted)" }}>{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function Modal({ open, onClose, title, desc, children, footer, wide }) {
  if (!open) return null;
  return (
    <div className="ui-modal-bg" onClick={onClose}>
      <div className="ui-modal" style={{ maxWidth: wide ? 760 : 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 p-5" style={{ borderBottom: "1px solid var(--line)" }}>
          <div>
            <h3 className="text-[18px] font-extrabold" style={{ color: "var(--text)" }}>{title}</h3>
            {desc && <p className="text-[13.5px] mt-0.5" style={{ color: "var(--muted)" }}>{desc}</p>}
          </div>
          <Btn variant="ghost" size="sm" icon="x" onClick={onClose} />
        </div>
        <div className="p-5 ui-scroll" style={{ overflowY: "auto" }}>{children}</div>
        {footer && <div className="flex justify-end gap-2.5 p-5" style={{ borderTop: "1px solid var(--line)" }}>{footer}</div>}
      </div>
    </div>
  );
}

function Bars({ data, height = 180 }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-1.5 sm:gap-2" style={{ height }}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex items-end" style={{ height: "100%" }}>
          <div className="ui-bar" style={{ height: Math.max(6, Math.round((v / max) * (height - 6))) }} title={String(v)} />
        </div>
      ))}
    </div>
  );
}
function Donut({ segments, size = 168, label, value }) {
  let acc = 0;
  const stops = segments.map((s) => { const from = acc; acc += s.pct; return `${s.color} ${from}% ${acc}%`; }).join(", ");
  return (
    <div className="grid place-items-center" style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${stops})` }}>
      <div className="grid place-items-center text-center" style={{ width: size * 0.62, height: size * 0.62, borderRadius: "50%", background: "var(--panel-2)" }}>
        <div>
          <p className="text-[26px] font-extrabold" style={{ color: "var(--text)" }}>{value}</p>
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>{label}</p>
        </div>
      </div>
    </div>
  );
}

function Row({ children, className = "", ...p }) { return <tr className={className} {...p}>{children}</tr>; }

Object.assign(window, { cx, Btn, Card, Badge, Avatar, PageHead, Tabs, Segmented, Field, Input, Textarea, Select, Toggle, StatCard, EmptyState, Modal, Bars, Donut, Row });
