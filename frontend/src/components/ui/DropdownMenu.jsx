import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function DropdownMenu({ label = "More actions", align = "right", children, triggerClassName = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        className={`icon-button ${triggerClassName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          className={`absolute top-full z-30 mt-2 min-w-48 rounded-xl border border-hairline bg-white p-1 shadow-[var(--shadow-floating)] ${
            align === "left" ? "left-0" : "right-0"
          }`}
          role="menu"
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, icon: Icon, danger = false, disabled = false, onClick, as: Component = "button", ...props }) {
  const className = `flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium ${
    danger ? "text-rose-700 hover:bg-rose-50" : "text-neutral-700 hover:bg-neutral-50 hover:text-ink"
  } disabled:cursor-not-allowed disabled:opacity-50`;

  return (
    <Component
      type={Component === "button" ? "button" : undefined}
      className={className}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      {...props}
    >
      {Icon && <Icon size={16} className="shrink-0" />}
      <span className="min-w-0 truncate">{children}</span>
    </Component>
  );
}
