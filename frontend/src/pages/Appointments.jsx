import { CalendarClock, CheckCircle, Eye, Plus, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
    const [appointmentList, agentList, leadList] = await Promise.all([
      api("/appointments"),
      api("/agents"),
      api("/leads")
    ]);
    setAppointments(appointmentList);
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
        const result = await api(`/appointments/${selected._id}/reschedule`, {
          method: "POST",
          body: { date: form.date, time: form.time, timezone: form.timezone }
        });
        setNotice(schedulingNotice(result, "Appointment rescheduled."));
      } else {
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
    } catch (err) {
      setError(errorText(err));
    } finally {
      setActingId("");
    }
  }

  return (
    <>
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
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="font-bold text-slate-950">Appointments</h2>
          <button className="btn-secondary" onClick={() => load().catch((err) => setError(errorText(err)))}><RefreshCw size={16} />Refresh</button>
        </div>
        {!appointments.length ? (
          <div className="p-6"><EmptyState title="No appointments yet" description="Book an appointment manually or let AI calls create appointments automatically." /></div>
        ) : (
          <div className="table-wrap">
            <table className="table w-full min-w-[1250px]">
              <thead>
                <tr><th>Lead</th><th>Agent</th><th>Date & Time</th><th>Phone</th><th>Type</th><th>Status</th><th>Reminder</th><th>Appointment Call</th><th>Source</th><th>Actions</th></tr>
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
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-xl border border-slate-200 p-2" title="View / Reschedule" onClick={() => action(appointment, "view")}><Eye size={16} /></button>
                        <button className="rounded-xl border border-slate-200 p-2" title="Complete" disabled={actingId === appointment._id || appointment.status === "completed"} onClick={() => action(appointment, "complete")}><CheckCircle size={16} /></button>
                        <button className="rounded-xl border border-slate-200 p-2 text-rose-600" title="Cancel" disabled={actingId === appointment._id || appointment.status === "cancelled"} onClick={() => action(appointment, "cancel")}><XCircle size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form className="modal-panel rounded-3xl bg-white p-4 shadow-2xl sm:max-w-2xl sm:p-6" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-950">{selected ? "Reschedule Appointment" : "Book Appointment"}</h2>
                <p className="text-sm text-slate-500">Select a lead, time, and reminder preference.</p>
              </div>
              <button type="button" className="rounded-xl border border-slate-200 p-2" onClick={() => setModalOpen(false)}>x</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Select Agent"><select value={form.agentId} onChange={(event) => setField("agentId", event.target.value)} disabled={Boolean(selected)}>{agents.map((agent) => <option key={agent._id} value={agent._id}>{agent.agentName}</option>)}</select></Field>
              <Field label="Select Lead"><select value={form.leadId} onChange={(event) => setField("leadId", event.target.value)} disabled={Boolean(selected)}>{leads.map((lead) => <option key={lead._id} value={lead._id}>{leadLabel(lead)}</option>)}</select></Field>
              <Field label="Appointment Type"><select value={form.appointmentType} onChange={(event) => setField("appointmentType", event.target.value)} disabled={Boolean(selected)}>{appointmentTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>
              <Field label="Timezone"><input value={form.timezone} onChange={(event) => setField("timezone", event.target.value)} required /></Field>
              <Field label="Date"><input type="date" value={form.date} onChange={(event) => setField("date", event.target.value)} required /></Field>
              <Field label="Time"><input type="time" value={form.time} onChange={(event) => setField("time", event.target.value)} required /></Field>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.reminderEnabled} onChange={(event) => setField("reminderEnabled", event.target.checked)} disabled={Boolean(selected)} />Reminder Enabled</label>
              <Field label="Notes"><textarea rows={3} value={form.notes} onChange={(event) => setField("notes", event.target.value)} disabled={Boolean(selected)} /></Field>
            </div>
            <div className="mt-5 action-row">
              <button className="btn-primary" type="submit"><CalendarClock size={16} />{selected ? "Reschedule" : "Book Appointment"}</button>
              <button className="btn-secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function SummaryCard({ label, value }) {
  return <article className="card"><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-950">{value}</p></article>;
}

function Field({ label, children }) {
  return <label className="min-w-0"><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>{children}</label>;
}
