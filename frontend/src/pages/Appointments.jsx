import { CalendarClock, CheckCircle, Eye, MoreVertical, Plus, RefreshCw, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const appointmentTypes = ["call", "meeting", "demo", "visit", "consultation"];

function defaultTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Calcutta";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function defaultTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return date.toTimeString().slice(0, 5);
}

function errorText(err) {
  return err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
}

function maskEmail(value = "") {
  const [name, domain] = String(value || "").split("@");
  if (!name || !domain) return value ? "***" : "";
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(value = "") {
  const text = String(value || "");
  if (text.length <= 4) return text ? "***" : "";
  return `${"*".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
}

function debugAppointmentPayload(form, leads = []) {
  const selectedLead = leads.find((lead) => lead._id === form.leadId);
  return {
    ...form,
    selectedLead: selectedLead
      ? {
          id: selectedLead._id,
          namePresent: Boolean(selectedLead.name || selectedLead.contactName || selectedLead.businessName),
          phone: maskPhone(selectedLead.phone),
          email: maskEmail(selectedLead.email)
        }
      : null
  };
}

function debugAppointmentList(appointments = []) {
  return appointments.map((appointment) => ({
    id: appointment._id,
    agentId: appointment.agentId?._id || appointment.agentId,
    leadId: appointment.leadId?._id || appointment.leadId,
    startAt: appointment.startAt,
    status: appointment.status,
    source: appointment.source,
    customerPhone: maskPhone(appointment.customerPhone || appointment.leadId?.phone),
    customerEmail: maskEmail(appointment.customerEmail || appointment.leadId?.email)
  }));
}

function leadLabel(lead) {
  return lead?.businessName || lead?.contactName || lead?.name || lead?.phone || "Lead";
}

function schedulingNotice(result, fallback) {
  const appointment = result?.appointment || result;
  const meta = result?.meta || appointment || {};
  const parts = [fallback];
  if (meta.reminderStatus === "skipped") parts.push(meta.reminderSkipReason || "Reminder skipped because appointment is too soon");
  if (meta.reminderStatus === "scheduled") parts.push("Reminder scheduled");
  if (meta.appointmentCallScheduled) parts.push("Appointment call scheduled");
  return parts.join(" ");
}

export default function Appointments() {
  const location = useLocation();
  const [appointments, setAppointments] = useState([]);
  const [agents, setAgents] = useState([]);
  const [leads, setLeads] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [actingId, setActingId] = useState("");
  const [openActionsId, setOpenActionsId] = useState("");
  const [form, setForm] = useState({
    agentId: "",
    leadId: "",
    appointmentType: "consultation",
    date: today(),
    time: defaultTime(),
    timezone: defaultTimezone(),
    notes: "",
    reminderEnabled: true
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const summary = useMemo(() => {
    const now = new Date();
    const todayKey = now.toDateString();
    return {
      today: appointments.filter((item) => new Date(item.startAt).toDateString() === todayKey).length,
      upcoming: appointments.filter((item) => ["scheduled", "rescheduled"].includes(item.status) && new Date(item.startAt) >= now).length,
      completed: appointments.filter((item) => item.status === "completed").length,
      cancelled: appointments.filter((item) => item.status === "cancelled").length
    };
  }, [appointments]);

  async function load() {
    const params = new URLSearchParams(location.search);
    const requestedAgentId = params.get("agentId") || "";
    const requestedLeadId = params.get("leadId") || "";
    const appointmentParams = new URLSearchParams();
    if (requestedAgentId) appointmentParams.set("agentId", requestedAgentId);
    if (requestedLeadId) appointmentParams.set("leadId", requestedLeadId);
    const appointmentPath = `/appointments${appointmentParams.toString() ? `?${appointmentParams.toString()}` : ""}`;
    console.log("[Appointment Debug][Frontend] Fetch endpoint", {
      endpoint: appointmentPath,
      requestedAgentId,
      requestedLeadId
    });
    const [appointmentList, agentList, leadList] = await Promise.all([
      api(appointmentPath),
      api("/agents"),
      api("/leads")
    ]);
    console.log("[Appointment Debug][Frontend] Appointment fetch response", {
      count: appointmentList.length,
      appointments: debugAppointmentList(appointmentList)
    });
    setAppointments(appointmentList);
    console.log("[Appointment Debug][Frontend] Appointment list data after fetch", {
      count: appointmentList.length,
      appointments: debugAppointmentList(appointmentList)
    });
    setAgents(agentList);
    setLeads(leadList);
    setForm((current) => ({
      ...current,
      agentId: requestedAgentId || current.agentId || agentList[0]?._id || "",
      leadId: requestedLeadId || current.leadId || leadList[0]?._id || ""
    }));
    if (params.get("open") === "1") {
      setSelected(null);
      setModalOpen(true);
    }
  }

  useEffect(() => {
    load().catch((err) => setError(errorText(err)));
  }, [location.search]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openCreate() {
    setSelected(null);
    setForm((current) => ({ ...current, date: today(), time: defaultTime(), notes: "" }));
    setModalOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    setNotice("");
    setError("");

    try {
      if (selected) {
        console.log("[Appointment Debug][Frontend] Submit clicked", { mode: "reschedule", appointmentId: selected._id });
        console.log("[Appointment Debug][Frontend] Appointment payload before API", {
          date: form.date,
          time: form.time,
          timezone: form.timezone
        });
        console.log("[Appointment Debug][Frontend] API endpoint", {
          endpoint: `/appointments/${selected._id}/reschedule`,
          method: "POST"
        });
        const result = await api(`/appointments/${selected._id}/reschedule`, {
          method: "POST",
          body: { date: form.date, time: form.time, timezone: form.timezone }
        });
        setNotice(schedulingNotice(result, "Appointment rescheduled."));
      } else {
        console.log("[Appointment Debug][Frontend] Submit clicked", { mode: "create" });
        console.log("[Appointment Debug][Frontend] Appointment payload before API", debugAppointmentPayload(form, leads));
        console.log("[Appointment Debug][Frontend] API endpoint", { endpoint: "/appointments", method: "POST" });
        const result = await api("/appointments", { method: "POST", body: form });
        setNotice(schedulingNotice(result, "Appointment booked."));
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function action(appointment, type) {
    setActingId(appointment._id);
    setNotice("");
    setError("");

    try {
      if (type === "view") {
        setSelected(appointment);
        setForm({
          agentId: appointment.agentId?._id || appointment.agentId,
          leadId: appointment.leadId?._id || appointment.leadId,
          appointmentType: appointment.appointmentType,
          date: appointment.date || new Date(appointment.startAt).toISOString().slice(0, 10),
          time: appointment.time || new Date(appointment.startAt).toTimeString().slice(0, 5),
          timezone: appointment.timezone || defaultTimezone(),
          notes: appointment.notes || "",
          reminderEnabled: appointment.reminderEnabled !== false
        });
        setModalOpen(true);
      } else if (type === "cancel") {
        if (!confirm("Cancel this appointment?")) return;
        await api(`/appointments/${appointment._id}/cancel`, { method: "POST" });
        setNotice("Appointment cancelled.");
        await load();
      } else if (type === "complete") {
        await api(`/appointments/${appointment._id}/complete`, { method: "POST" });
        setNotice("Appointment marked completed.");
        await load();
      }
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
        title="Appointments"
        description="Book, manage, and track appointments created manually or from AI call conversations."
        action={<button className="btn-primary" onClick={openCreate}><Plus size={16} />Book Appointment</button>}
      />

      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Today" value={summary.today} />
        <SummaryCard label="Upcoming" value={summary.upcoming} />
        <SummaryCard label="Completed" value={summary.completed} />
        <SummaryCard label="Cancelled" value={summary.cancelled} />
      </div>

      <section className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <h2 className="font-semibold text-ink">Appointments</h2>
          <button className="btn-secondary" onClick={() => load().catch((err) => setError(errorText(err)))}><RefreshCw size={16} />Refresh</button>
        </div>
        {!appointments.length ? (
          <div className="p-6"><EmptyState title="No appointments yet" description="Book an appointment manually or let AI calls create appointments automatically." /></div>
        ) : (
          <div className="table-wrap">
            <table className="table w-full min-w-[1180px]">
              <thead>
                <tr><th>Lead</th><th>Agent</th><th>Date & Time</th><th>Phone</th><th>Type</th><th>Status</th><th>Reminder</th><th>Appointment Call</th><th>Source</th><th className="w-16 text-right">Options</th></tr>
              </thead>
              <tbody>
                {appointments.map((appointment) => (
                  <tr key={appointment._id}>
                    <td className="break-anywhere">{leadLabel(appointment.leadId)}</td>
                    <td>{appointment.agentId?.agentName || "Agent"}</td>
                    <td>{appointment.startAt ? new Date(appointment.startAt).toLocaleString([], { timeZone: appointment.timezone || undefined }) : "-"}</td>
                    <td className="break-anywhere">{appointment.customerPhone || appointment.leadId?.phone || "-"}</td>
                    <td>{appointment.appointmentType}</td>
                    <td><StatusBadge status={appointment.status} /></td>
                    <td>
                      {appointment.reminderStatus === "skipped"
                        ? <span className="text-xs font-semibold text-amber-700">{appointment.reminderSkipReason || "Reminder skipped because appointment is too soon"}</span>
                        : <StatusBadge status={appointment.reminderStatus || "not_requested"} />}
                    </td>
                    <td><StatusBadge status={appointment.appointmentCallStatus || (appointment.status === "completed" ? "completed" : "scheduled")} /></td>
                    <td>{appointment.source}</td>
                    <td className="text-right">
                      <AppointmentActionsMenu
                        appointment={appointment}
                        isOpen={openActionsId === appointment._id}
                        setOpen={(open) => setOpenActionsId(open ? appointment._id : "")}
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

      {modalOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form
            className="w-full max-w-[560px] rounded-xl bg-white p-6 shadow-pop sm:p-8"
            onSubmit={submit}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold leading-7 text-ink">{selected ? "Reschedule Appointment" : "Book Appointment"}</h2>
                <p className="mt-1 text-sm leading-5 text-neutral-500">Select a lead, time, and reminder preference.</p>
              </div>
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                onClick={() => setModalOpen(false)}
                aria-label="Close appointment modal"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
              <Field label="Select Agent"><select value={form.agentId} onChange={(event) => setField("agentId", event.target.value)} disabled={Boolean(selected)}>{agents.map((agent) => <option key={agent._id} value={agent._id}>{agent.agentName}</option>)}</select></Field>
              <Field label="Select Lead"><select value={form.leadId} onChange={(event) => setField("leadId", event.target.value)} disabled={Boolean(selected)}>{leads.map((lead) => <option key={lead._id} value={lead._id}>{leadLabel(lead)}</option>)}</select></Field>
              <Field label="Appointment Type"><select value={form.appointmentType} onChange={(event) => setField("appointmentType", event.target.value)} disabled={Boolean(selected)}>{appointmentTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>
              <Field label="Timezone"><input value={form.timezone} onChange={(event) => setField("timezone", event.target.value)} required /></Field>
              <Field label="Date"><input type="date" value={form.date} onChange={(event) => setField("date", event.target.value)} required /></Field>
              <Field label="Time"><input type="time" value={form.time} onChange={(event) => setField("time", event.target.value)} required /></Field>
              <label className="flex min-h-10 items-center gap-2 text-[13px] font-medium text-neutral-700">
                <input
                  className="h-[18px] min-h-0 w-[18px] rounded border-neutral-300 accent-ink focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  type="checkbox"
                  checked={form.reminderEnabled}
                  onChange={(event) => setField("reminderEnabled", event.target.checked)}
                  disabled={Boolean(selected)}
                />
                Reminder Enabled
              </label>
              <Field label="Notes"><textarea className="h-10 min-h-10 resize-none py-2" rows={1} value={form.notes} onChange={(event) => setField("notes", event.target.value)} disabled={Boolean(selected)} /></Field>
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <button className="btn-primary" type="submit"><CalendarClock size={16} />{selected ? "Reschedule" : "Book Appointment"}</button>
              <button className="btn-secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function AppointmentActionsMenu({ appointment, isOpen, setOpen, actingId, action }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 320 });

  function updatePosition() {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 24);
    const menuHeight = menuRef.current?.offsetHeight || 250;
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
  }, [isOpen, appointment._id]);

  function run(type) {
    setOpen(false);
    action(appointment, type);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="inline-grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-white text-neutral-600 transition hover:bg-neutral-50 hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open appointment options"
        title="Open appointment options"
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
          className="fixed z-[9999] w-[min(16.25rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-hairline bg-white p-2 text-left shadow-pop"
          style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
          role="menu"
        >
          <div className="px-2 pb-2 pt-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Actions</p>
            <MenuButton icon={Eye} onClick={() => run("view")}>
              View / Reschedule
            </MenuButton>
            <MenuButton icon={CheckCircle} disabled={actingId === appointment._id || appointment.status === "completed"} onClick={() => run("complete")}>
              Complete
            </MenuButton>
          </div>

          <div className="mt-1 border-t border-hairline px-2 pt-2">
            <MenuButton danger icon={XCircle} disabled={actingId === appointment._id || appointment.status === "cancelled"} onClick={() => run("cancel")}>
              Cancel Appointment
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

function SummaryCard({ label, value }) {
  return <article className="card"><p className="text-sm font-semibold text-neutral-500">{label}</p><p className="mt-2 text-3xl font-semibold text-ink">{value}</p></article>;
}

function Field({ label, children }) {
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-[13px] font-medium leading-5 text-neutral-700">{label}</span>
      <div className="[&_input]:h-10 [&_input]:rounded-lg [&_input]:border-neutral-200 [&_input]:px-3 [&_input]:focus:border-blue-500 [&_input]:focus:ring-blue-100 [&_select]:h-10 [&_select]:rounded-lg [&_select]:border-neutral-200 [&_select]:px-3 [&_select]:focus:border-blue-500 [&_select]:focus:ring-blue-100 [&_textarea]:rounded-lg [&_textarea]:border-neutral-200 [&_textarea]:px-3 [&_textarea]:focus:border-blue-500 [&_textarea]:focus:ring-blue-100">
        {children}
      </div>
    </label>
  );
}
