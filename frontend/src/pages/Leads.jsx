import { CalendarClock, Download, FileText, MailSearch, MoreVertical, PhoneCall, Search, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const statusStyles = {
  new: "bg-brand-50 text-brand-700",
  follow_up: "bg-amber-50 text-amber-700",
  appointment_booked: "bg-violet-50 text-violet-700",
  unable_to_reach: "bg-rose-50 text-rose-700",
  qualified: "bg-emerald-50 text-emerald-700",
  not_interested: "bg-neutral-100 text-neutral-700",
  converted: "bg-emerald-50 text-emerald-700",
  contacted: "bg-cyan-50 text-cyan-700",
  interested: "bg-blue-50 text-blue-700",
  booked: "bg-violet-50 text-violet-700",
  closed: "bg-emerald-50 text-emerald-700",
  lost: "bg-rose-50 text-rose-700"
};

function formatStatus(status) {
  if (!status) return "Unknown";
  return String(status)
    .replaceAll("_", " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function getShortLeadName(name) {
  const fallback = "Unknown";
  const clean = String(name || "").trim();
  if (!clean) return fallback;
  const firstPart = clean.split(/\s[-|,]\s|[-|,]/)[0]?.trim() || clean;
  const normalized = firstPart.replace(/\s+/g, " ");
  return normalized.length > 28 ? `${normalized.slice(0, 25).trim()}...` : normalized;
}

function truncateValue(value, max = 32) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) =>
      [lead.name, lead.phone, lead.email, lead.city, lead.requirement, lead.status, lead.source]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [leads, search]);
  const [followUpsByLead, setFollowUpsByLead] = useState({});
  const [threadsByLead, setThreadsByLead] = useState({});
  const [openActionsId, setOpenActionsId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [schedulingId, setSchedulingId] = useState("");
  const [enrichingId, setEnrichingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [leadList, followUps, emailThreads] = await Promise.all([api("/leads"), api("/followups"), api("/email/threads")]);
    setLeads(leadList);
    setFollowUpsByLead(followUps.reduce((acc, followUp) => {
      const leadId = followUp.leadId?._id || followUp.leadId;
      if (leadId) acc[leadId] = (acc[leadId] || 0) + 1;
      return acc;
    }, {}));
    setThreadsByLead(emailThreads.reduce((acc, thread) => {
      const leadId = thread.leadId?._id || thread.leadId;
      if (leadId) acc[leadId] = [...(acc[leadId] || []), thread];
      return acc;
    }, {}));
  }

  useEffect(() => {
    load();
  }, []);

  async function addNote(id) {
    const note = prompt("Add note");
    if (!note) return;
    await api(`/leads/${id}`, { method: "PUT", body: { note } });
    load();
  }

  async function callAgain(id) {
    await api(`/leads/${id}/call-again`, { method: "POST" });
    load();
  }

  async function deleteLead(id) {
    if (!confirm("Are you sure you want to delete this lead?")) return;
    setDeletingId(id);
    setNotice("");
    setError("");

    try {
      await api(`/leads/${id}`, { method: "DELETE" });
      setLeads((current) => current.filter((lead) => lead._id !== id));
      if (selected?._id === id) setSelected(null);
      setOpenActionsId("");
      setNotice("Lead deleted successfully");
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    } finally {
      setDeletingId("");
    }
  }

  async function scheduleFollowUp(lead) {
    if (!lead.agentId?._id && !lead.agentId) {
      setError("Lead is missing an assigned agent.");
      return;
    }

    const defaultTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const scheduledAt = prompt("Follow-up call time", defaultTime);
    if (!scheduledAt) return;

    setSchedulingId(lead._id);
    setNotice("");
    setError("");

    try {
      await api("/followups", {
        method: "POST",
        body: {
          agentId: lead.agentId?._id || lead.agentId,
          leadId: lead._id,
          type: "call",
          trigger: "manual",
          status: "scheduled",
          scheduledAt: new Date(scheduledAt).toISOString(),
          maxAttempts: 3,
          note: "Manual lead follow-up"
        }
      });
      setNotice("Follow-up scheduled successfully");
      await load();
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    } finally {
      setSchedulingId("");
    }
  }

  async function findEmail(lead) {
    if (!lead.website) {
      setError("Lead website is missing.");
      return;
    }

    setEnrichingId(lead._id);
    setNotice("");
    setError("");

    try {
      const result = await api("/lead-finder/enrich-emails", {
        method: "POST",
        body: { leadIds: [lead._id] }
      });
      const enrichedLead = result.saved?.[0];
      setNotice(enrichedLead?.email ? `Email found: ${enrichedLead.email}` : "No email found on this website.");
      await load();
      if (selected?._id === lead._id && enrichedLead) setSelected(enrichedLead);
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    } finally {
      setEnrichingId("");
    }
  }

  async function exportCsv() {
    const csv = await api("/leads/export/csv");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "leads.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function appointmentUrl(lead, open = false) {
    const params = new URLSearchParams();
    const agentId = lead.agentId?._id || lead.agentId;
    if (agentId) params.set("agentId", agentId);
    if (lead._id) params.set("leadId", lead._id);
    if (open) params.set("open", "1");
    const query = params.toString();
    return `/appointments${query ? `?${query}` : ""}`;
  }

  return (
    <>
      <PageHeader title="Leads" description="CRM-style lead management for customers captured from calls, callback forms, transcripts, and messages." action={<button className="btn-secondary" onClick={exportCsv}><Download size={16} />Export CSV</button>} />
      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {!leads.length ? (
        <EmptyState title="No leads captured yet. Leads will appear after calls or messages." />
      ) : (
        <>
          <div className="relative mb-4">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              className="pl-9"
              style={{ height: 40, minHeight: 40 }}
              placeholder="Search by name, phone, email, status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {!filteredLeads.length && <p className="py-8 text-center text-sm text-neutral-500">No leads found for your search.</p>}
          <div className="mobile-card-list">
            {filteredLeads.map((lead) => (
              <article key={lead._id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink" title={lead.name || "Unknown lead"}>{getShortLeadName(lead.name)}</p>
                    <p className="break-anywhere text-sm text-neutral-500">{lead.phone || "-"}</p>
                  </div>
                  <LeadStatusBadge status={lead.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Info label="Requirement" value={truncateValue(lead.requirement || "Requirement pending")} title={lead.requirement || "Requirement pending"} />
                  <Info label="Created" value={lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : "-"} />
                  <Info label="Status" value={formatStatus(lead.status)} />
                </div>
                <div className="mt-4 flex justify-end">
                  <LeadActionsMenu
                    lead={lead}
                    isOpen={openActionsId === lead._id}
                    setOpen={(open) => setOpenActionsId(open ? lead._id : "")}
                    setSelected={setSelected}
                    addNote={addNote}
                    findEmail={findEmail}
                    scheduleFollowUp={scheduleFollowUp}
                    callAgain={callAgain}
                    deleteLead={deleteLead}
                    appointmentUrl={appointmentUrl}
                    followUpCount={followUpsByLead[lead._id] || 0}
                    deleting={deletingId === lead._id}
                    scheduling={schedulingId === lead._id}
                    enriching={enrichingId === lead._id}
                  />
                </div>
              </article>
            ))}
          </div>
          <div className="desktop-table card overflow-hidden p-0">
            <div className="table-wrap">
              <table className="table w-full min-w-[860px]">
                <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Requirement</th><th>Preferred</th><th>Status</th><th>Created</th><th className="w-14 text-right">More</th></tr></thead>
                <tbody>
                  {filteredLeads.map((lead) => (
                    <tr key={lead._id}>
                      <td><div className="max-w-[13rem] truncate" title={lead.name || "Unknown"}>{getShortLeadName(lead.name)}</div></td>
                      <td className="break-anywhere">{lead.phone || "-"}</td>
                      <td><div className="max-w-[12rem] truncate" title={lead.email || "-"}>{truncateValue(lead.email, 28)}</div></td>
                      <td><div className="max-w-[13rem] truncate" title={lead.requirement || "-"}>{truncateValue(lead.requirement, 34)}</div></td>
                      <td><div className="max-w-[11rem] truncate" title={[lead.preferredDate, lead.preferredTime].filter(Boolean).join(" ") || "-"}>{truncateValue([lead.preferredDate, lead.preferredTime].filter(Boolean).join(" "), 26)}</div></td>
                      <td>
                        <LeadStatusBadge status={lead.status} />
                      </td>
                      <td>{new Date(lead.createdAt).toLocaleDateString()}</td>
                      <td className="text-right">
                        <LeadActionsMenu
                          lead={lead}
                          isOpen={openActionsId === lead._id}
                          setOpen={(open) => setOpenActionsId(open ? lead._id : "")}
                          setSelected={setSelected}
                          addNote={addNote}
                          findEmail={findEmail}
                          scheduleFollowUp={scheduleFollowUp}
                          callAgain={callAgain}
                          deleteLead={deleteLead}
                          appointmentUrl={appointmentUrl}
                          followUpCount={followUpsByLead[lead._id] || 0}
                          deleting={deletingId === lead._id}
                          scheduling={schedulingId === lead._id}
                          enriching={enrichingId === lead._id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="modal-panel rounded-2xl bg-white p-4 shadow-pop sm:max-w-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-semibold text-ink">Lead Detail</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Info label="Name" value={selected.name} />
              <Info label="Phone" value={selected.phone} />
              <Info label="Email" value={selected.email} />
              <Info label="Email Enrichment" value={selected.emailEnrichmentStatus} />
              <Info label="Email Source" value={selected.emailSourceUrl} />
              <Info label="Requirement" value={selected.requirement} />
              <Info label="Preferred Date" value={selected.preferredDate} />
              <Info label="Preferred Time" value={selected.preferredTime} />
            </div>
            <div className="mt-5 rounded-2xl border border-hairline p-4">
              <p className="mb-2 font-semibold text-ink">Notes timeline</p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-2xl bg-neutral-50 p-3 text-sm text-neutral-700">{JSON.stringify(selected.notes || [], null, 2)}</pre>
            </div>
            <div className="mt-5 rounded-2xl border border-hairline p-4">
              <p className="mb-2 font-semibold text-ink">Email Conversations</p>
              {!threadsByLead[selected._id]?.length ? (
                <p className="text-sm text-neutral-500">No email conversations yet.</p>
              ) : (
                <div className="space-y-2">
                  {threadsByLead[selected._id].map((thread) => (
                    <Link key={thread._id} className="block rounded-2xl border border-hairline p-3 hover:bg-neutral-50" to={`/email-inbox?thread=${thread._id}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="break-anywhere text-sm font-semibold text-ink">{thread.subject || "No subject"}</p>
                        <StatusBadge status={thread.status} />
                      </div>
                      <p className="mt-1 break-anywhere text-xs text-neutral-500">{thread.lastMessagePreview || "Open in Email Inbox"}</p>
                      <p className="mt-2 text-xs text-neutral-400">{thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : "-"}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-5 action-row">
              <button className="btn-secondary" onClick={() => addNote(selected._id)}>Add Note</button>
              <button className="btn-secondary" disabled={!selected.website || enrichingId === selected._id} onClick={() => findEmail(selected)}>
                {enrichingId === selected._id ? "Finding..." : "Find Email"}
              </button>
              <button className="btn-secondary" disabled={schedulingId === selected._id} onClick={() => scheduleFollowUp(selected)}>
                {schedulingId === selected._id ? "Scheduling..." : "Schedule Follow-up"}
              </button>
              <Link className="btn-secondary" to="/followups">View Follow-ups</Link>
              <Link className="btn-secondary" to={appointmentUrl(selected, true)}>Book Appointment</Link>
              <Link className="btn-secondary" to={appointmentUrl(selected)}>View Appointments</Link>
              <button className="btn-primary" onClick={() => callAgain(selected._id)}>Call Again</button>
              <button className="btn-secondary text-rose-600" disabled={deletingId === selected._id} onClick={() => deleteLead(selected._id)}>
                {deletingId === selected._id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LeadActionsMenu({ lead, isOpen, setOpen, setSelected, addNote, findEmail, scheduleFollowUp, callAgain, deleteLead, appointmentUrl, followUpCount, deleting, scheduling, enriching }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 420 });

  function updatePosition() {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const menuHeight = menuRef.current?.offsetHeight || 430;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const opensUp = spaceBelow < menuHeight && rect.top > spaceBelow;
    const maxHeight = Math.max(240, opensUp ? rect.top - 16 : spaceBelow);
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
  }, [isOpen, lead._id]);

  function run(action) {
    setOpen(false);
    action();
  }

  return (
    <div className="page-stack">
      <button
        ref={buttonRef}
        type="button"
        className="inline-grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-white text-neutral-600 transition hover:bg-neutral-50 hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open lead actions"
        title="Open lead actions"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isOpen) updatePosition();
          setOpen(!isOpen);
        }}
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="fixed z-[9999] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-hairline bg-white p-2 text-left shadow-pop"
          style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
          role="menu"
        >
          <div className="px-2 pb-2 pt-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Lead Actions</p>
            <MenuButton icon={UserRound} onClick={() => run(() => setSelected(lead))}>View Lead</MenuButton>
            <MenuButton icon={FileText} onClick={() => run(() => setSelected(lead))}>View Details</MenuButton>
            {lead.callLogId?.transcriptUrl && (
              <MenuLink href={lead.callLogId.transcriptUrl} icon={FileText} target="_blank" onClick={() => setOpen(false)}>
                View Transcript
              </MenuLink>
            )}
            <MenuLink href={`/email-outreach?leadId=${lead._id}`} icon={MailSearch} onClick={() => setOpen(false)}>
              Send Email
            </MenuLink>
            <MenuButton icon={FileText} onClick={() => run(() => addNote(lead._id))}>Add Note</MenuButton>
            <MenuButton icon={MailSearch} disabled={!lead.website || enriching} onClick={() => run(() => findEmail(lead))}>
              {enriching ? "Finding Email..." : "Find Email"}
            </MenuButton>
            <MenuButton icon={CalendarClock} disabled={scheduling} onClick={() => run(() => scheduleFollowUp(lead))}>
              {scheduling ? "Scheduling..." : "Schedule Follow-up"}
            </MenuButton>
            <MenuLink href="/followups" icon={CalendarClock} onClick={() => setOpen(false)}>
              View Follow-ups ({followUpCount})
            </MenuLink>
            <MenuLink href={appointmentUrl(lead, true)} icon={CalendarClock} onClick={() => setOpen(false)}>
              Book Appointment
            </MenuLink>
            <MenuLink href={appointmentUrl(lead)} icon={CalendarClock} onClick={() => setOpen(false)}>
              View Appointments
            </MenuLink>
            <MenuButton icon={PhoneCall} onClick={() => run(() => callAgain(lead._id))}>Call Lead</MenuButton>
          </div>

          <div className="mt-1 border-t border-hairline px-2 pt-2">
            <MenuButton danger icon={Trash2} disabled={deleting} onClick={() => run(() => deleteLead(lead._id))}>
              {deleting ? "Deleting..." : "Delete Lead"}
            </MenuButton>
          </div>
        </div>
      )}
    </div>
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

function MenuLink({ children, icon: Icon, href, onClick, ...props }) {
  const isExternal = /^https?:\/\//i.test(String(href || ""));
  const className = "flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-neutral-700 hover:bg-neutral-50 hover:text-ink";

  if (isExternal) {
    return (
      <a
        className={className}
        href={href}
        role="menuitem"
        onClick={onClick}
        {...props}
      >
        <Icon size={16} className="shrink-0" />
        <span className="min-w-0 truncate">{children}</span>
      </a>
    );
  }

  return (
    <Link
      className={className}
      to={href}
      role="menuitem"
      onClick={onClick}
      {...props}
    >
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

function LeadStatusBadge({ status }) {
  const key = String(status || "").toLowerCase();
  return <span className={`badge ${statusStyles[key] || "bg-neutral-100 text-neutral-700"}`}>{formatStatus(status)}</span>;
}

function Info({ label, value, title }) {
  return <div className="rounded-2xl bg-neutral-50 p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{label}</p><p className="break-anywhere text-sm font-semibold text-ink" title={title}>{value || "Not provided"}</p></div>;
}
