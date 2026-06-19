import { CalendarClock, Eye, MoreVertical, PhoneCall, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

function errorText(err) {
  return err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
}

function leadLabel(lead) {
  return lead?.businessName || lead?.contactName || lead?.name || lead?.phone || "Lead";
}

function triggerLabel(trigger) {
  const labels = {
    call_declined: "Call Declined",
    call_not_picked: "Not Picked",
    call_busy: "Busy",
    call_failed: "Failed",
    email_sent: "Email Sent",
    imported_call: "Imported Call",
    manual: "Manual"
  };
  return labels[trigger] || trigger || "-";
}

export default function FollowUps() {
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState("");
  const [openActionsId, setOpenActionsId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const summary = useMemo(() => ({
    pending: followUps.filter((item) => item.status === "pending").length,
    scheduled: followUps.filter((item) => item.status === "scheduled").length,
    completed: followUps.filter((item) => item.status === "completed").length,
    failed: followUps.filter((item) => item.status === "failed").length
  }), [followUps]);

  async function load() {
    setLoading(true);
    setFollowUps(await api("/followups"));
    setLoading(false);
  }

  useEffect(() => {
    load().catch((err) => {
      setLoading(false);
      setError(errorText(err));
    });
  }, []);

  async function action(id, type) {
    setActingId(id);
    setNotice("");
    setError("");

    try {
      if (type === "reschedule") {
        const current = followUps.find((item) => item._id === id);
        const initial = current?.scheduledAt ? new Date(current.scheduledAt).toISOString().slice(0, 16) : "";
        const scheduledAt = prompt("New follow-up time", initial);
        if (!scheduledAt) return;
        await api(`/followups/${id}/reschedule`, { method: "POST", body: { scheduledAt: new Date(scheduledAt).toISOString() } });
        setNotice("Follow-up rescheduled.");
      } else if (type === "cancel") {
        if (!confirm("Cancel this follow-up?")) return;
        await api(`/followups/${id}/cancel`, { method: "POST" });
        setNotice("Follow-up cancelled.");
      } else if (type === "run") {
        await api(`/followups/${id}/run`, { method: "POST" });
        setNotice("Follow-up run started.");
      }

      await load();
      setOpenActionsId("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setActingId("");
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Follow-ups"
        description="Scheduled follow-up calls created from email outreach and manual lead actions."
        action={<button className="btn-secondary" onClick={() => load().catch((err) => setError(errorText(err)))}><RefreshCw size={16} />Refresh</button>}
      />

      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Pending" value={summary.pending} />
        <SummaryCard label="Scheduled" value={summary.scheduled} />
        <SummaryCard label="Completed" value={summary.completed} />
        <SummaryCard label="Failed" value={summary.failed} />
      </div>

      <section className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-6"><EmptyState title="Loading follow-ups..." /></div>
        ) : !followUps.length ? (
          <div className="p-6"><EmptyState title="No follow-ups yet" description="Successful email campaigns will schedule call follow-ups automatically." /></div>
        ) : (
          <div className="table-wrap">
            <table className="table w-full min-w-[1120px]">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Agent</th>
                  <th>Type</th>
                  <th>Last Call Outcome</th>
                  <th>Trigger Reason</th>
                  <th>Retry Scheduled At</th>
                  <th>Status</th>
                  <th>Attempt Count</th>
                  <th className="w-16 text-right">Options</th>
                </tr>
              </thead>
              <tbody>
                {followUps.map((followUp) => (
                  <tr key={followUp._id}>
                    <td className="break-anywhere">
                      <div className="font-semibold text-ink">{leadLabel(followUp.leadId)}</div>
                      <div className="text-xs text-neutral-500">{followUp.leadId?.phone || followUp.leadId?.email || "-"}</div>
                    </td>
                    <td className="break-anywhere">{followUp.agentId?.agentName || "Agent"}</td>
                    <td>{followUp.type}</td>
                    <td><StatusBadge status={followUp.callLogId?.normalizedStatus || "unknown"} /></td>
                    <td>{triggerLabel(followUp.trigger)}</td>
                    <td>{followUp.scheduledAt ? new Date(followUp.scheduledAt).toLocaleString() : "-"}</td>
                    <td><StatusBadge status={followUp.status} /></td>
                    <td>{followUp.attemptCount || 0}/{followUp.maxAttempts || 3}</td>
                    <td className="text-right">
                      <FollowUpActionsMenu
                        followUp={followUp}
                        isOpen={openActionsId === followUp._id}
                        setOpen={(open) => setOpenActionsId(open ? followUp._id : "")}
                        actingId={actingId}
                        action={action}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function FollowUpActionsMenu({ followUp, isOpen, setOpen, actingId, action }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 320 });
  const isDone = ["completed", "cancelled"].includes(followUp.status);
  const canRun = !["completed", "cancelled", "running"].includes(followUp.status);

  function updatePosition() {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 24);
    const menuHeight = menuRef.current?.offsetHeight || 260;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const opensUp = spaceBelow < menuHeight && rect.top > spaceBelow;
    const maxHeight = Math.max(220, opensUp ? rect.top - 16 : spaceBelow);
    const top = opensUp ? Math.max(12, rect.top - Math.min(menuHeight, maxHeight) - 8) : rect.bottom + 8;
    const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);

    setPosition({ top, left, maxHeight });
  }

  useEffect(() => {
    if (!isOpen) return undefined;

    updatePosition();

    function onPointerDown(event) {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, followUp._id]);

  function run(type) {
    setOpen(false);
    action(followUp._id, type);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="inline-grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-white text-neutral-600 transition hover:bg-neutral-50 hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open follow-up options"
        title="Open follow-up options"
        onClick={() => setOpen(!isOpen)}
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="fixed z-50 w-[min(16.25rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-hairline bg-white p-2 text-left shadow-pop"
          style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
          role="menu"
        >
          <div className="px-2 pb-2 pt-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Actions</p>
            <MenuButton icon={PhoneCall} disabled={actingId === followUp._id || !canRun} onClick={() => run("run")}>
              Run Now
            </MenuButton>
            <MenuButton icon={CalendarClock} disabled={actingId === followUp._id || isDone} onClick={() => run("reschedule")}>
              Reschedule
            </MenuButton>
            {followUp.leadId?._id && (
              <MenuLink to="/leads" icon={Eye} onClick={() => setOpen(false)}>
                View Lead
              </MenuLink>
            )}
          </div>

          <div className="mt-1 border-t border-hairline px-2 pt-2">
            <MenuButton danger icon={XCircle} disabled={actingId === followUp._id || isDone} onClick={() => run("cancel")}>
              Cancel Follow-up
            </MenuButton>
          </div>
        </div>
      )}
    </>
  );
}

function MenuButton({ children, icon: Icon, danger = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold ${
        danger ? "text-rose-700 hover:bg-rose-50" : "text-neutral-700 hover:bg-neutral-50 hover:text-ink"
      } disabled:cursor-not-allowed disabled:opacity-50`}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
    >
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

function MenuLink({ children, icon: Icon, to, onClick }) {
  return (
    <Link
      className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-neutral-700 hover:bg-neutral-50 hover:text-ink"
      to={to}
      onClick={onClick}
      role="menuitem"
    >
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

function SummaryCard({ label, value }) {
  return (
    <article className="card">
      <p className="text-sm font-semibold text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
    </article>
  );
}
