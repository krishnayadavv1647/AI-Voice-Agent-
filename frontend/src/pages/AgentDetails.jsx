import { CalendarClock, Edit, Eye, Globe2, Loader2, MoreVertical, PhoneCall, Play, Radio, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

function formatApiError(error) {
  const response = error?.response;
  if (response?.userMessage) return response.userMessage;
  if (response?.message) return response.message;
  if (typeof response?.details === "string") return response.details;
  return error?.message || "Something went wrong.";
}

function formatDuration(call) {
  if (typeof call.durationSeconds === "number") {
    const minutes = Math.floor(call.durationSeconds / 60);
    const seconds = call.durationSeconds % 60;
    return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }

  return call.duration || "Pending";
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function isFinalCallStatus(status) {
  return ["completed", "failed", "ended", "cancelled", "canceled"].includes(String(status || "").toLowerCase());
}

function defaultTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function defaultLocalDateTime() {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatScheduleTime(schedule) {
  if (!schedule?.scheduledForUtc) return "Not scheduled";
  return new Date(schedule.scheduledForUtc).toLocaleString([], { timeZone: schedule.timezone || undefined });
}

function formatAppointmentTime(appointment) {
  if (!appointment?.startAt) return "Not scheduled";
  return new Date(appointment.startAt).toLocaleString([], { timeZone: appointment.timezone || undefined });
}

export default function AgentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [calls, setCalls] = useState([]);
  const [scheduledCalls, setScheduledCalls] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [callLoading, setCallLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalNotice, setModalNotice] = useState("");
  const [selectedCall, setSelectedCall] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    phoneNumber: "",
    scheduledForLocal: defaultLocalDateTime(),
    timezone: defaultTimezone()
  });
  const pollingRef = useRef(null);

  const agent = data?.agent;

  async function load() {
    try {
      const [agentData, callData, scheduleData, appointmentData] = await Promise.all([
        api(`/agents/${id}`),
        api(`/agents/${id}/calls`),
        api(`/scheduled-calls/agent/${id}`),
        api(`/appointments?agentId=${id}`)
      ]);
      setData(agentData);
      setCalls(callData);
      setScheduledCalls(scheduleData);
      setAppointments(appointmentData);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (location.state?.notice) setNotice(location.state.notice);
    if (location.state?.warning) setWarning(location.state.warning);
    load();

    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current);
    };
  }, [id]);

  async function triggerCall(type) {
    const phoneNumber = prompt("Enter destination phone number in E.164 format, for example +918002816147");
    if (!phoneNumber) return;

    setCallLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await api(`/agents/${id}/${type === "test" ? "test-call" : "outbound-call"}`, {
        method: "POST",
        body: { phoneNumber }
      });
      if (result.callLog) {
        setCalls((current) => [result.callLog, ...current.filter((call) => call._id !== result.callLog._id)]);
      }
      setNotice(type === "test" ? "Test call started." : "Outbound call started.");
      await load();
      startCallPolling(result.callLog?._id);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setCallLoading(false);
    }
  }

  function setScheduleField(name, value) {
    setScheduleForm((current) => ({ ...current, [name]: value }));
  }

  async function scheduleCall(event) {
    event.preventDefault();
    setScheduleLoading(true);
    setError("");
    setNotice("");

    try {
      const schedule = await api("/scheduled-calls", {
        method: "POST",
        body: {
          agentId: id,
          phoneNumber: scheduleForm.phoneNumber,
          scheduledForLocal: scheduleForm.scheduledForLocal,
          timezone: scheduleForm.timezone
        }
      });

      setScheduledCalls((current) => [schedule, ...current.filter((item) => item._id !== schedule._id)]);
      setScheduleForm((current) => ({
        ...current,
        phoneNumber: "",
        scheduledForLocal: defaultLocalDateTime()
      }));
      setNotice("Call scheduled.");
      await load();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setScheduleLoading(false);
    }
  }

  async function cancelScheduledCall(scheduleId) {
    setScheduleLoading(true);
    setError("");
    setNotice("");

    try {
      const schedule = await api(`/scheduled-calls/${scheduleId}/cancel`, { method: "PATCH" });
      setScheduledCalls((current) => current.map((item) => item._id === schedule._id ? schedule : item));
      setNotice("Scheduled call cancelled.");
      await load();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setScheduleLoading(false);
    }
  }

  function repeatCall(call) {
    if (!call?.callerNumber) return;

    setScheduleForm((current) => ({
      ...current,
      phoneNumber: call.callerNumber,
      scheduledForLocal: defaultLocalDateTime(),
      timezone: current.timezone || defaultTimezone()
    }));

    closeCall();
    setNotice("Repeat call details added to the schedule form below.");
    window.location.hash = "scheduled-calls";
    document.getElementById("scheduled-calls")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openCall(call) {
    setModalError("");
    setModalNotice("");
    setSelectedCall(call);
  }

  function closeCall() {
    setModalError("");
    setModalNotice("");
    setSelectedCall(null);
  }

  function startCallPolling(callLogId) {
    if (pollingRef.current) window.clearInterval(pollingRef.current);

    let attempts = 0;
    pollingRef.current = window.setInterval(async () => {
      attempts += 1;

      try {
        const latestCalls = await api(`/agents/${id}/calls`);
        setCalls(latestCalls);
        const watchedCall = latestCalls.find((call) => call._id === callLogId) || latestCalls[0];

        if (attempts >= 12 || isFinalCallStatus(watchedCall?.normalizedStatus || watchedCall?.status)) {
          window.clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } catch {
        if (attempts >= 12) {
          window.clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    }, 5000);
  }

  async function extractLead(callId) {
    setModalError("");
    setModalNotice("");
    setExtracting(true);
    try {
      const result = await api(`/calls/${callId}/extract-lead`, { method: "POST" });
      const updatedCall = result.callLog || result;
      setCalls((current) => current.map((call) => call._id === updatedCall._id ? updatedCall : call));
      setSelectedCall((current) => current?._id === updatedCall._id ? updatedCall : current);
      setModalNotice(result.lead ? "Lead extracted from transcript." : "No lead found in this call's transcript.");
      await load();
    } catch (err) {
      setModalError(formatApiError(err));
    } finally {
      setExtracting(false);
    }
  }

  async function syncSelectedCall(callId) {
    setModalError("");
    setModalNotice("");
    setExtracting(true);
    try {
      const result = await api(`/calls/${callId}/sync`, { method: "POST" });
      const updatedCall = result.callLog || result;
      setCalls((current) => current.map((call) => call._id === updatedCall._id ? updatedCall : call));
      setSelectedCall((current) => current?._id === updatedCall._id ? updatedCall : current);
      setModalNotice(updatedCall.transcript ? "Call synced and transcript loaded." : "Call synced. Transcript is not ready yet.");
      await load();
    } catch (err) {
      setModalError(formatApiError(err));
    } finally {
      setExtracting(false);
    }
  }

  async function removeAgent() {
    if (!confirm("Delete this agent?")) return;
    setError("");
    setNotice("");
    try {
      await api(`/agents/${id}`, { method: "DELETE" });
      navigate("/agents");
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function action(type) {
    setError("");
    setNotice("");
    try {
      await api(`/agents/${id}/${type}`, { method: "POST" });
      await load();
      setNotice(type === "publish" ? "Agent published." : "Agent updated.");
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  const connected = Boolean(agent?.dograhWorkflowId || agent?.dograhWorkflowUuid);

  return (
    <div className="page-stack">
      <PageHeader
        title={agent?.agentName || "Agent Details"}
        description={agent ? `${agent.agentType} for ${agent.businessName}` : "Loading agent..."}
        action={agent && (
          <>
            <StatusBadge status={agent.status} />
          </>
        )}
      />

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {warning && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">{warning}</div>}
      {notice && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

      {agent && (
        <div className="min-w-0">
          <section className="mx-auto max-w-6xl space-y-6">
            <div className="card">
              <div id="test-call" className="mb-4 action-row">
                <button className="btn-secondary" onClick={() => navigate(`/agents/${id}/edit`)}><Edit size={16} />Edit Agent</button>
                <Link className="btn-primary" to={`/agents/${id}/bio-page`}><Globe2 size={16} />Customize Bio Page</Link>
                <button className="btn-secondary" disabled={callLoading} onClick={() => triggerCall("test")}><PhoneCall size={16} />Test Call</button>
                <button className="btn-secondary" disabled={callLoading} onClick={() => triggerCall("outbound")}><Radio size={16} />Outbound Call</button>
                <button className="btn-secondary" onClick={() => document.getElementById("scheduled-calls")?.scrollIntoView({ behavior: "smooth", block: "start" })}><CalendarClock size={16} />Schedule Call</button>
                <button className="btn-secondary" onClick={() => action("publish")}><Play size={16} />Publish</button>
                <button className="btn-secondary text-rose-600" onClick={removeAgent}><Trash2 size={16} />Delete</button>
              </div>

              <div id="overview" className="grid gap-4 md:grid-cols-2">
                <Info label="Business" value={agent.businessName} />
                <Info label="Category" value={agent.businessCategory} />
                <Info label="Location" value={agent.businessLocation} />
                <Info label="Working Hours" value={agent.workingHours} />
                <Info label="Contact" value={agent.contactNumber} />
              </div>
            </div>

            <div id="voice-settings" className="card">
              <h2 className="mb-3 font-semibold text-ink">Voice settings</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Info label="Language" value={agent.language} />
                <Info label="Gender" value={agent.voiceGender} />
                <Info label="Tone" value={agent.tone} />
                <Info label="Personality" value={agent.personality} />
              </div>
            </div>

            <div id="scheduled-calls" className="card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-ink">Scheduled Calls</h2>
                </div>
                <CalendarClock className="text-brand-700" size={20} />
              </div>

              <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={scheduleCall}>
                <label className="block text-sm font-medium text-neutral-700">
                  Phone Number
                  <input className="mt-1" required placeholder="+918000000000" value={scheduleForm.phoneNumber} onChange={(event) => setScheduleField("phoneNumber", event.target.value)} />
                </label>
                <label className="block text-sm font-medium text-neutral-700">
                  Date and Time
                  <input className="mt-1" required type="datetime-local" value={scheduleForm.scheduledForLocal} onChange={(event) => setScheduleField("scheduledForLocal", event.target.value)} />
                </label>
                <label className="block text-sm font-medium text-neutral-700">
                  Timezone
                  <input className="mt-1" required value={scheduleForm.timezone} onChange={(event) => setScheduleField("timezone", event.target.value)} />
                </label>
                <button className="btn-primary self-end" disabled={scheduleLoading || !connected}>
                  <CalendarClock size={16} />{scheduleLoading ? "Saving..." : "Schedule"}
                </button>
              </form>

              <div className="mt-5 grid gap-3">
                {scheduledCalls.map((schedule) => (
                  <article key={schedule._id} className="rounded-xl border border-hairline p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-anywhere font-semibold text-ink">{schedule.phoneNumber}</p>
                        <p className="text-sm text-neutral-500">{formatScheduleTime(schedule)} · {schedule.timezone}</p>
                        {schedule.lastError && <p className="mt-1 text-xs text-rose-700">{schedule.lastError}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={schedule.status} />
                        {["pending", "scheduled"].includes(schedule.status) && (
                          <button className="btn-secondary px-3 py-1.5 text-xs" disabled={scheduleLoading} onClick={() => cancelScheduledCall(schedule._id)}>Cancel</button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
                {!scheduledCalls.length && <div className="rounded-xl border border-dashed border-hairline p-4 text-center text-sm text-neutral-500">No scheduled calls.</div>}
              </div>
            </div>

            <div id="appointments" className="card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-ink">Appointments</h2>
                </div>
                <button className="btn-secondary" onClick={() => navigate(`/appointments?agentId=${id}&open=1`)}><CalendarClock size={16} />Book Appointment</button>
              </div>

              <div className="grid gap-3">
                {appointments.map((appointment) => (
                  <article key={appointment._id} className="rounded-xl border border-hairline p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-anywhere font-semibold text-ink">
                          {appointment.leadId?.businessName || appointment.leadId?.name || appointment.customerName || appointment.customerPhone || "Appointment"}
                        </p>
                        <p className="text-sm text-neutral-500">{formatAppointmentTime(appointment)} - {appointment.appointmentType}</p>
                        {appointment.notes && <p className="mt-1 text-sm text-neutral-600">{appointment.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={appointment.status} />
                        <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => navigate(`/appointments?agentId=${id}&leadId=${appointment.leadId?._id || appointment.leadId}`)}>View</button>
                      </div>
                    </div>
                  </article>
                ))}
                {!appointments.length && <div className="rounded-xl border border-dashed border-hairline p-4 text-center text-sm text-neutral-500">No appointments for this agent.</div>}
              </div>
            </div>

            <div id="call-logs" className="card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-semibold text-ink">Call Logs</h2>
                <button className="btn-secondary" onClick={load}><RefreshCw size={16} />Refresh</button>
              </div>
              <div className="mobile-card-list">
                {calls.map((call) => (
                  <article key={call._id} className="rounded-2xl border border-hairline bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-anywhere font-semibold text-ink">{call.callerNumber || "Unknown caller"}</p>
                        <p className="break-anywhere text-sm text-neutral-500">{call.callingNumber || "No caller ID"}</p>
                      </div>
                      <StatusBadge status={call.normalizedStatus || call.status || "pending"} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Info label="Duration" value={formatDuration(call)} />
                      <Info label="Lead" value={call.leadCaptured ? "Yes" : "No"} />
                      <Info label="Date" value={new Date(call.createdAt).toLocaleString()} />
                    </div>
                    <div className="mt-2">
                      <PipelineStatus call={call} onSync={syncSelectedCall} onExtract={extractLead} />
                    </div>
                    <div className="mt-4">
                      <ThreeDotMenu actions={[
                        { label: "View", onClick: () => openCall(call) },
                        { label: "Repeat", disabled: !call.callerNumber, onClick: () => repeatCall(call) },
                        call.recordingUrl ? { label: "Recording", onClick: () => window.open(call.recordingUrl, "_blank") } : null
                      ].filter(Boolean)} />
                    </div>
                  </article>
                ))}
                {!calls.length && <div className="rounded-2xl border border-dashed border-hairline p-5 text-center text-sm text-neutral-500">No calls yet.</div>}
              </div>
              <div className="desktop-table table-wrap">
                <table className="table w-full min-w-[1120px]">
                  <thead>
                    <tr><th>Date</th><th>Caller Number</th><th>Calling Number</th><th>Status</th><th>Duration</th><th>Lead</th><th>Pipeline</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {calls.map((call) => (
                      <tr key={call._id}>
                        <td>{new Date(call.createdAt).toLocaleString()}</td>
                        <td>{call.callerNumber || "-"}</td>
                        <td>{call.callingNumber || "-"}</td>
                        <td><StatusBadge status={call.normalizedStatus || call.status || "pending"} /></td>
                        <td>{formatDuration(call)}</td>
                        <td>{call.leadCaptured ? "Yes" : "No"}</td>
                        <td><PipelineStatus call={call} onSync={syncSelectedCall} onExtract={extractLead} /></td>
                        <td>
                          <ThreeDotMenu actions={[
                            { label: "View", onClick: () => openCall(call) },
                            { label: "Repeat", disabled: !call.callerNumber, onClick: () => repeatCall(call) },
                            call.recordingUrl ? { label: "Recording", onClick: () => window.open(call.recordingUrl, "_blank") } : null
                          ].filter(Boolean)} />
                        </td>
                      </tr>
                    ))}
                    {!calls.length && <tr><td colSpan="8" className="text-center text-neutral-500">No calls yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

          </section>
        </div>
      )}

      {selectedCall && (
        <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/30 p-4" onClick={closeCall}>
          <div className="modal-panel rounded-2xl bg-white p-4 shadow-soft sm:max-w-4xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Call Details</h2>
                <p className="text-sm text-neutral-500">{agent.agentName} call record.</p>
              </div>
              <button type="button" className="rounded-lg border border-hairline p-2" onClick={closeCall}><X size={18} /></button>
            </div>

            {modalError && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{modalError}</div>}
            {modalNotice && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{modalNotice}</div>}

            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Agent" value={agent.agentName} />
              <Info label="Status" value={selectedCall.normalizedStatus || selectedCall.status} />
              <Info label="Caller Number" value={selectedCall.callerNumber} />
              <Info label="Calling Number" value={selectedCall.callingNumber} />
              <Info label="Duration" value={formatDuration(selectedCall)} />
              <Info label="Start Time" value={selectedCall.startedAt ? new Date(selectedCall.startedAt).toLocaleString() : ""} />
              <Info label="End Time" value={selectedCall.endedAt ? new Date(selectedCall.endedAt).toLocaleString() : ""} />
            </div>

            {selectedCall.recordingUrl && (
              <div className="mt-4 rounded-lg border border-hairline p-4">
                <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Recording</p>
                <audio className="w-full" controls src={selectedCall.recordingUrl} />
                <a className="mt-2 inline-block text-sm font-semibold text-brand-700" href={selectedCall.recordingUrl} target="_blank">Open recording</a>
              </div>
            )}

            {selectedCall.transcriptUrl && (
              <div className="mt-4 rounded-lg border border-hairline p-4">
                <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Transcript Link</p>
                <a className="text-sm font-semibold text-brand-700" href={selectedCall.transcriptUrl} target="_blank">Open transcript</a>
              </div>
            )}

            <DetailBlock title="Summary" value={selectedCall.summary || "No summary available"} />
            <DetailBlock title="Transcript" value={selectedCall.transcript} />
            <DetailBlock title="Lead Data" value={selectedCall.leadData ? JSON.stringify(selectedCall.leadData, null, 2) : "No extracted lead data available."} pre />

            <div className="mt-6 action-row sm:justify-end">
              {(() => {
                const canSync = Boolean(selectedCall.dograhRunId || selectedCall.providerCallId);
                const syncTitle = canSync ? "" : "This call has no provider run/call id to sync from yet.";
                return (
                  <button className="btn-secondary" disabled={extracting} title={syncTitle} onClick={() => syncSelectedCall(selectedCall._id)}>
                    <RefreshCw size={16} />Sync Transcript
                  </button>
                );
              })()}
              <button className="btn-secondary" disabled={extracting} onClick={() => extractLead(selectedCall._id)}>
                {extracting ? "Extracting…" : selectedCall.leadData ? "Re-extract Lead" : "Extract Lead"}
              </button>
              <button className="btn-secondary" disabled={!selectedCall.callerNumber} title={!selectedCall.callerNumber ? "This call has no caller number to dial." : ""} onClick={() => repeatCall(selectedCall)}><RefreshCw size={16} />Repeat</button>
              <button className="btn-primary" onClick={closeCall}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase text-neutral-500">{label}</p>
      <p className="break-words text-sm text-neutral-700">{value || "Not provided"}</p>
    </div>
  );
}

function PipelineStatus({ call, onSync, onExtract }) {
  const status = call.pipelineStatus;
  if (!status || status === "pending") {
    return <span className="pipeline-status-cell"><span className="pipeline-dot pipeline-dot-pending" title="Waiting" />Pending</span>;
  }
  if (status === "syncing") {
    return <span className="pipeline-status-cell"><Loader2 size={10} className="animate-spin" style={{ flexShrink: 0 }} /><span>Syncing…</span></span>;
  }
  if (status === "extracting") {
    return <span className="pipeline-status-cell"><Loader2 size={10} className="animate-spin" style={{ flexShrink: 0 }} /><span>Extracting…</span></span>;
  }
  if (status === "synced") {
    return <span className="pipeline-status-cell"><span className="pipeline-dot pipeline-dot-synced" />Synced</span>;
  }
  if (status === "completed") {
    return <span className="pipeline-status-cell"><span className="pipeline-dot pipeline-dot-completed" />Done</span>;
  }
  if (status === "failed") {
    const isExtractFailed = call.autoExtractFailureCount >= 5;
    const label = isExtractFailed ? "Extract failed" : "Sync failed";
    return (
      <span className="pipeline-status-cell" title={call.lastPipelineError || ""}>
        <span className="pipeline-dot pipeline-dot-failed" />
        {label}&nbsp;
        <button
          type="button"
          className="pipeline-retry-link"
          onClick={() => isExtractFailed ? onExtract(call._id) : onSync(call._id)}
        >Retry</button>
      </span>
    );
  }
  return null;
}

function DetailBlock({ title, value, pre = false }) {
  return (
    <div className="mt-4 rounded-lg border border-hairline p-4">
      <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">{title}</p>
      {pre ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">{value || "Not provided"}</pre>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-neutral-700">{value || "Not provided"}</p>
      )}
    </div>
  );
}

function ThreeDotMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
    }
    setOpen((prev) => !prev);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="rounded-lg border border-hairline p-1.5 text-neutral-500 hover:bg-neutral-50"
        onClick={handleToggle}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          className="w-40 rounded-xl border border-hairline bg-white py-1 shadow-lg"
        >
          {actions.map((act, i) => (
            <button
              key={i}
              type="button"
              disabled={act.disabled}
              className={`flex w-full items-center px-3 py-2 text-left text-sm disabled:opacity-40 ${act.danger ? "text-rose-600 hover:bg-rose-50" : "text-neutral-700 hover:bg-neutral-50"}`}
              onClick={() => {
                act.onClick();
                setOpen(false);
              }}
            >
              {act.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
