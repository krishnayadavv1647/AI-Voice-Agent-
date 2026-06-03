import { Cable, Edit, Eye, Headphones, MessageCircle, Mic, MicOff, PhoneCall, Play, Radio, RefreshCw, Send, Square, Trash2, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

function readWorkflowList(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.workflows)) return response.workflows;
  if (Array.isArray(response?.results)) return response.results;
  return [];
}

function isActiveWorkflow(workflow) {
  const status = String(workflow?.status || workflow?.workflow_status || workflow?.state || "").toLowerCase();
  return !(
    workflow?.archived === true ||
    workflow?.isArchived === true ||
    workflow?.is_archived === true ||
    workflow?.deleted === true ||
    workflow?.isDeleted === true ||
    workflow?.is_deleted === true ||
    status === "archived" ||
    status === "inactive" ||
    status === "deleted"
  );
}

function readActiveWorkflowList(response) {
  const workflows = readWorkflowList(response);
  const activeWorkflows = workflows.filter(isActiveWorkflow);

  console.log("Total Dograh workflows:", workflows.length);
  console.log("Active Dograh workflows:", activeWorkflows.length);

  return activeWorkflows;
}

function workflowId(workflow) {
  return workflow.id || workflow.workflow_id || workflow.workflowId || workflow._id || "";
}

function workflowUuid(workflow) {
  return workflow.uuid || workflow.workflow_uuid || workflow.workflowUuid || "";
}

function workflowName(workflow) {
  return workflow.name || workflow.workflow_name || workflow.title || workflow.workflowName || "Untitled workflow";
}

function formatDuration(call) {
  if (typeof call.durationSeconds === "number") {
    const minutes = Math.floor(call.durationSeconds / 60);
    const seconds = call.durationSeconds % 60;
    return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }

  return call.duration || "Pending";
}

function isFinalCallStatus(status) {
  return ["completed", "failed", "ended", "cancelled", "canceled"].includes(String(status || "").toLowerCase());
}

export default function AgentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [calls, setCalls] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const [debugResponse, setDebugResponse] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [callLoading, setCallLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [webCallOpen, setWebCallOpen] = useState(false);
  const [runSyncForm, setRunSyncForm] = useState({ workflowId: "", runId: "", callLogId: "" });
  const pollingRef = useRef(null);
  const [connectForm, setConnectForm] = useState({
    dograhWorkflowId: "",
    dograhWorkflowUuid: "",
    dograhWorkflowName: "",
    connectedPhoneNumber: "",
    callerIdNumber: "",
    telephonyProvider: "twilio"
  });

  const agent = data?.agent;

  async function load() {
    try {
      const [agentData, callData] = await Promise.all([api(`/agents/${id}`), api(`/agents/${id}/calls`)]);
      setData(agentData);
      setCalls(callData);
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

  useEffect(() => {
    if (!agent) return;
    setConnectForm({
      dograhWorkflowId: agent.dograhWorkflowId || "",
      dograhWorkflowUuid: agent.dograhWorkflowUuid || "",
      dograhWorkflowName: agent.dograhWorkflowName || "",
      connectedPhoneNumber: agent.connectedPhoneNumber || "",
      callerIdNumber: agent.callerIdNumber || "",
      telephonyProvider: agent.telephonyProvider || "twilio"
    });
  }, [agent?._id]);

  async function openConnectModal() {
    setError("");
    setConnectOpen(true);
    try {
      setWorkflows(readActiveWorkflowList(await api("/dograh/workflows")));
    } catch (err) {
      setError(err.message);
    }
  }

  function selectWorkflow(value) {
    const selected = workflows.find((workflow) => workflowUuid(workflow) === value || workflowId(workflow) === value);
    if (!selected) return;
    setConnectForm((current) => ({
      ...current,
      dograhWorkflowId: workflowId(selected),
      dograhWorkflowUuid: workflowUuid(selected),
      dograhWorkflowName: workflowName(selected)
    }));
  }

  async function connectWorkflow(event) {
    event.preventDefault();
    setConnecting(true);
    setError("");
    setNotice("");
    try {
      await api(`/agents/${id}/connect-dograh`, { method: "POST", body: connectForm });
      setConnectOpen(false);
      setNotice("Dograh workflow connected.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

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
      setDebugResponse(result);
      if (result.callLog) {
        setCalls((current) => [result.callLog, ...current.filter((call) => call._id !== result.callLog._id)]);
      }
      setNotice(type === "test" ? "Call started through Dograh." : "Outbound call started through Dograh.");
      await load();
      startCallPolling(result.callLog?._id);
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    } finally {
      setCallLoading(false);
    }
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

        if (attempts >= 12 || isFinalCallStatus(watchedCall?.status)) {
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

  async function syncCall(callId) {
    setError("");
    setNotice("");
    try {
      const result = await api(`/calls/${callId}/sync`, { method: "POST" });
      const updatedCall = result.callLog || result;
      setCalls((current) => current.map((call) => call._id === updatedCall._id ? updatedCall : call));
      setSelectedCall((current) => current?._id === updatedCall._id ? updatedCall : current);
      setNotice("Call log synced from Dograh.");
      await load();
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    }
  }

  async function extractLead(callId) {
    setError("");
    setNotice("");
    try {
      const result = await api(`/calls/${callId}/extract-lead`, { method: "POST" });
      const updatedCall = result.callLog || result;
      setCalls((current) => current.map((call) => call._id === updatedCall._id ? updatedCall : call));
      setSelectedCall((current) => current?._id === updatedCall._id ? updatedCall : current);
      setNotice(result.lead ? "Lead extracted from transcript." : "No lead extracted from transcript.");
      await load();
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    }
  }

  async function syncByRun(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      const result = await api("/calls/sync-by-run", {
        method: "POST",
        body: {
          workflowId: runSyncForm.workflowId,
          runId: runSyncForm.runId,
          callLogId: runSyncForm.callLogId || undefined
        }
      });

      setDebugResponse(result);
      setNotice("Dograh run fetched and saved.");
      await load();
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    }
  }

  async function sendChatMessage(event) {
    event.preventDefault();
    const text = chatMessage.trim();
    if (!text) return;

    setChatMessage("");
    setChatLoading(true);
    setError("");
    setChatMessages((current) => [...current, { role: "user", text }]);

    try {
      const result = await api(`/agents/${id}/test-chat`, {
        method: "POST",
        body: { message: text }
      });

      setChatMessages((current) => [...current, { role: "assistant", text: result.response || result.reply }]);
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
      setChatMessages((current) => [...current, { role: "assistant", text: `Message failed. ${err.message || "Check backend Gemini configuration and try again."}`, error: true }]);
    } finally {
      setChatLoading(false);
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
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    }
  }

  async function action(type) {
    await api(`/agents/${id}/${type}`, { method: "POST" });
    load();
  }

  async function retryDograhWorkflowCreation() {
    setError("");
    setWarning("");
    setNotice("");
    setCallLoading(true);
    try {
      const result = await api(`/agents/${id}/create-dograh-workflow`, { method: "POST" });
      setDebugResponse(result);
      setNotice(result.dograhCreated ? "Dograh workflow created successfully." : result.warning || "Dograh workflow response did not include a workflow UUID.");
      await load();
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    } finally {
      setCallLoading(false);
    }
  }

  async function updateDograhWorkflow() {
    setError("");
    setNotice("");
    setCallLoading(true);
    try {
      console.log("Update Dograh Flow:", {
        agentId: id,
        provider: agent?.provider,
        providerWorkflowId: agent?.providerWorkflowId || agent?.dograhWorkflowId,
        apiMethod: "PATCH",
        apiPath: `/agents/${id}/sync-provider`
      });

      const result = await api(`/agents/${id}/sync-provider`, { method: "PATCH", body: { createIfMissing: false } });
      setDebugResponse(result);
      setNotice(result.message || "Provider synced successfully");
      await load();
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    } finally {
      setCallLoading(false);
    }
  }

  async function copyCallbackLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/call/${id}`);
    setNotice("Callback link copied.");
  }

  const connected = Boolean(agent?.dograhWorkflowUuid);
  const dograhWebCallAvailable = Boolean(
    agent?.provider === "dograh" ||
    agent?.providerWorkflowId ||
    agent?.dograhWorkflowId
  );
  const selectedWorkflowValue = useMemo(() => connectForm.dograhWorkflowUuid || connectForm.dograhWorkflowId, [connectForm]);
  const workflowSyncStatus = useMemo(() => {
    if (!agent) return "";
    if (["failed", "update_failed"].includes(String(agent.dograhStatus || "").toLowerCase())) return "Workflow Error";
    if (agent.dograhNeedsUpdate) return "Workflow Needs Update";
    if (agent.providerWorkflowId || agent.dograhWorkflowUuid) return "Workflow Synced";
    return "Workflow Missing";
  }, [agent]);

  return (
    <>
      <PageHeader
        title={agent?.agentName || "Agent Details"}
        description={agent ? `${agent.agentType} for ${agent.businessName}` : "Loading agent..."}
        action={agent && (
          <>
            <StatusBadge status={agent.status} />
            <span className={`badge ${
              workflowSyncStatus === "Workflow Synced" ? "bg-emerald-50 text-emerald-700" :
              workflowSyncStatus === "Workflow Needs Update" ? "bg-amber-50 text-amber-700" :
              workflowSyncStatus === "Workflow Error" ? "bg-rose-50 text-rose-700" :
              "bg-slate-100 text-slate-700"
            }`}>
              {workflowSyncStatus}
            </span>
          </>
        )}
      />

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {warning && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">{warning}</div>}
      {notice && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

      {agent && (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] xl:gap-6">
          <section className="space-y-6">
            <div className="card">
              <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-100 pb-4 text-sm">
                {[
                  ["Overview", "#overview"],
                  ["Message Test", "#message-test"],
                  ["Test Call", "#test-call"],
                  ["Call Logs", "#call-logs"],
                  ["Leads", "/leads"],
                  ["Voice/Language Settings", "#voice-settings"],
                  ["Dograh Settings", "#dograh-settings"],
                  ["Public Callback Link", "#callback-link"]
                ].map(([label, href]) => (
                  <a key={label} className="rounded-lg bg-slate-100 px-3 py-2 font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700" href={href}>{label}</a>
                ))}
              </div>
              <div id="test-call" className="mb-4 action-row">
                <button className="btn-secondary" onClick={openConnectModal}><Cable size={16} />Connect Dograh Workflow</button>
                <button className="btn-secondary" onClick={() => navigate(`/agents/${id}/edit`)}><Edit size={16} />Edit Agent</button>
                <a className="btn-secondary" href="#message-test"><MessageCircle size={16} />Message Test</a>
                {dograhWebCallAvailable && (
                  <button
                    className="btn-primary"
                    title="Start Dograh Web Call"
                    onClick={() => setWebCallOpen(true)}
                  >
                    <Headphones size={16} />Start Dograh Web Call
                  </button>
                )}
                <button className="btn-secondary" disabled={callLoading || !connected} onClick={() => triggerCall("test")}><PhoneCall size={16} />Test Call</button>
                <button className="btn-secondary" disabled={callLoading || !connected} onClick={() => triggerCall("outbound")}><Radio size={16} />Outbound Call</button>
                <button className="btn-secondary" disabled={callLoading} onClick={retryDograhWorkflowCreation}><RefreshCw size={16} />Retry Dograh Workflow Creation</button>
                <button className="btn-secondary" disabled={callLoading} onClick={updateDograhWorkflow}>
                  <RefreshCw size={16} />{agent.provider === "dograh" ? "Update Dograh Flow" : "Sync Provider"}
                </button>
                <button className="btn-secondary" onClick={() => action("publish")}><Play size={16} />Publish</button>
                <button className="btn-secondary text-rose-600" onClick={removeAgent}><Trash2 size={16} />Delete</button>
              </div>

              <div id="overview" className="grid gap-4 md:grid-cols-2">
                <Info label="Business" value={agent.businessName} />
                <Info label="Category" value={agent.businessCategory} />
                <Info label="Location" value={agent.businessLocation} />
                <Info label="Working Hours" value={agent.workingHours} />
                <Info label="Contact" value={agent.contactNumber} />
                <Info label="Dograh Connection" value={connected ? "Connected" : "Not connected"} />
                <Info label="Dograh Sync Status" value={workflowSyncStatus} />
              </div>
              {agent.dograhNeedsUpdate && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                  Agent saved locally. Update Dograh Workflow to apply these changes to live calls.
                </p>
              )}
              {!connected && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                  Create or connect Dograh workflow first.
                </p>
              )}
            </div>

            <div id="message-test" className="card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-ink">Message Test</h2>
                  <p className="text-sm text-slate-500">Uses Gemini for text chat. Phone calls still use Dograh.</p>
                </div>
                <MessageCircle className="text-brand-700" size={20} />
              </div>

              <div className="mb-4 min-h-56 space-y-3 rounded-lg bg-slate-50 p-3">
                {chatMessages.map((item, index) => (
                  <div
                    key={`${item.role}-${index}`}
                    className={`max-w-[82%] rounded-lg px-4 py-3 text-sm ${
                      item.role === "user"
                        ? "ml-auto bg-brand-600 text-white"
                        : item.error
                          ? "bg-rose-50 text-rose-700"
                          : "bg-white text-slate-800"
                    }`}
                  >
                    {item.text}
                  </div>
                ))}
                {!chatMessages.length && (
                  <div className="grid min-h-44 place-items-center text-sm text-slate-500">
                    Send a message to test this agent with Gemini.
                  </div>
                )}
              </div>

              <form className="flex flex-col gap-2 sm:flex-row" onSubmit={sendChatMessage}>
                <input value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} />
                <button className="btn-primary" disabled={chatLoading}>
                  <Send size={16} />
                  {chatLoading ? "Sending..." : "Send"}
                </button>
              </form>
            </div>

            <div id="call-logs" className="card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-bold text-ink">Call Logs</h2>
                <button className="btn-secondary" onClick={load}><RefreshCw size={16} />Refresh</button>
              </div>
              <div className="mobile-card-list">
                {calls.map((call) => (
                  <article key={call._id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-anywhere font-bold text-slate-950">{call.callerNumber || "Unknown caller"}</p>
                        <p className="break-anywhere text-sm text-slate-500">{call.callingNumber || "No caller ID"}</p>
                      </div>
                      <StatusBadge status={call.status || "pending"} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Info label="Duration" value={formatDuration(call)} />
                      <Info label="Lead" value={call.leadCaptured ? "Yes" : "No"} />
                      <Info label="Run ID" value={call.dograhRunId || "Missing"} />
                      <Info label="Date" value={new Date(call.createdAt).toLocaleString()} />
                    </div>
                    <div className="mt-4 action-row">
                      <button className="btn-secondary" onClick={() => setSelectedCall(call)}><Eye size={14} />View</button>
                      <button className="btn-secondary" disabled={!call.dograhRunId} title={!call.dograhRunId ? "Dograh Run ID missing. Please trigger a new call or check Dograh trigger response mapping." : "Sync from Dograh"} onClick={() => syncCall(call._id)}><RefreshCw size={14} />Sync</button>
                      {call.recordingUrl && <a className="btn-secondary" href={call.recordingUrl} target="_blank">Recording</a>}
                    </div>
                    {!call.dograhRunId && <p className="mt-2 text-xs text-amber-700">Dograh Run ID missing. Please trigger a new call or check Dograh trigger response mapping.</p>}
                  </article>
                ))}
                {!calls.length && <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No calls yet.</div>}
              </div>
              <div className="desktop-table table-wrap">
                <table className="table w-full min-w-[1120px]">
                  <thead>
                    <tr><th>Date</th><th>Caller Number</th><th>Calling Number</th><th>Run ID</th><th>Status</th><th>Duration</th><th>Lead Captured</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {calls.map((call) => (
                      <tr key={call._id}>
                        <td>{new Date(call.createdAt).toLocaleString()}</td>
                        <td>{call.callerNumber || "-"}</td>
                        <td>{call.callingNumber || "-"}</td>
                        <td>{call.dograhRunId || "Missing"}</td>
                        <td><StatusBadge status={call.status || "pending"} /></td>
                        <td>{formatDuration(call)}</td>
                        <td>{call.leadCaptured ? "Yes" : "No"}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setSelectedCall(call)}><Eye size={14} />View</button>
                            <button className="btn-secondary px-3 py-1.5 text-xs" disabled={!call.dograhRunId} title={!call.dograhRunId ? "Dograh Run ID missing. Please trigger a new call or check Dograh trigger response mapping." : "Sync from Dograh"} onClick={() => syncCall(call._id)}><RefreshCw size={14} />Sync</button>
                            {call.recordingUrl && <a className="btn-secondary px-3 py-1.5 text-xs" href={call.recordingUrl} target="_blank">Recording</a>}
                          </div>
                          {!call.dograhRunId && <p className="mt-1 text-xs text-amber-700">Dograh Run ID missing. Please trigger a new call or check Dograh trigger response mapping.</p>}
                        </td>
                      </tr>
                    ))}
                    {!calls.length && <tr><td colSpan="8" className="text-center text-slate-500">No calls yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h2 className="mb-3 font-bold text-ink">Debug: Fetch Dograh Run</h2>
              <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={syncByRun}>
                <input placeholder="Workflow ID" value={runSyncForm.workflowId} onChange={(event) => setRunSyncForm((current) => ({ ...current, workflowId: event.target.value }))} />
                <input placeholder="Run ID, for example 528264" value={runSyncForm.runId} onChange={(event) => setRunSyncForm((current) => ({ ...current, runId: event.target.value }))} />
                <input placeholder="Call Log ID optional" value={runSyncForm.callLogId} onChange={(event) => setRunSyncForm((current) => ({ ...current, callLogId: event.target.value }))} />
                <button className="btn-primary"><RefreshCw size={16} />Fetch</button>
              </form>
            </div>

            {debugResponse && (
              <div className="card">
                <h2 className="mb-3 font-bold text-ink">Dograh response debug</h2>
                <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(debugResponse, null, 2)}</pre>
              </div>
            )}

            <div id="dograh-settings" className="card">
              <h2 className="mb-3 font-bold text-ink">System prompt preview</h2>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-sm text-slate-100">{agent.systemPrompt}</pre>
            </div>
          </section>

          <aside className="space-y-6">
            <div id="voice-settings" className="card">
              <h2 className="mb-3 font-bold text-ink">Dograh workflow</h2>
              <Info label="Provider" value={agent.provider || (agent.dograhWorkflowId ? "dograh" : "custom")} />
              <Info label="Provider Workflow ID" value={agent.providerWorkflowId || agent.dograhWorkflowId} />
              <Info label="Workflow Name" value={agent.dograhWorkflowName} />
              <Info label="Workflow ID" value={agent.dograhWorkflowId} />
              <Info label="Workflow UUID" value={agent.dograhWorkflowUuid} />
              <Info label="Connected Phone Number" value={agent.connectedPhoneNumber} />
              <Info label="Caller ID Number" value={agent.callerIdNumber} />
              <Info label="Telephony Provider" value={agent.telephonyProvider} />
              <Info label="Dograh Status" value={agent.dograhStatus} />
              <Info label="Dograh Sync Status" value={workflowSyncStatus} />
              <Info label="Dograh Error" value={agent.dograhError} />
              {agent.dograhNeedsUpdate && (
                <button className="btn-primary mt-2 w-full" disabled={callLoading} onClick={updateDograhWorkflow}>
                  <RefreshCw size={16} />{agent.provider === "dograh" ? "Update Dograh Flow" : "Sync Provider"}
                </button>
              )}
              {["failed", "update_failed"].includes(String(agent.dograhStatus || "").toLowerCase()) && (
                <button className="btn-secondary mt-2 w-full" disabled={callLoading} onClick={retryDograhWorkflowCreation}>
                  <RefreshCw size={16} />Retry Dograh Workflow Creation
                </button>
              )}
            </div>

            <div className="card">
              <h2 className="mb-3 font-bold text-ink">Voice settings</h2>
              <Info label="Language" value={agent.language} />
              <Info label="Gender" value={agent.voiceGender} />
              <Info label="Tone" value={agent.tone} />
              <Info label="Personality" value={agent.personality} />
            </div>

            <div id="callback-link" className="card">
              <h2 className="mb-3 font-bold text-ink">Webhook</h2>
              <Info label="Dograh Webhook URL" value="Generated by backend from PUBLIC_BACKEND_URL" />
            </div>

            <div className="card">
              <h2 className="mb-3 font-bold text-ink">Public Callback Link</h2>
              <p className="mb-3 text-sm text-slate-500">Share this link with customers so they can request an AI callback.</p>
              <Info label="Callback URL" value={`/call/${agent._id}`} />
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={copyCallbackLink}>Copy Link</button>
                <a className="btn-primary" href={`/call/${agent._id}`} target="_blank">Preview</a>
              </div>
              <p className="mt-3 text-sm text-slate-500">Customers enter their phone number and the AI calls them.</p>
            </div>
          </aside>
        </div>
      )}

      {connectOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={() => setConnectOpen(false)}>
          <form className="modal-panel rounded-3xl bg-white p-4 shadow-soft sm:p-6" onSubmit={connectWorkflow} onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-ink">Connect Dograh Workflow</h2>
                <p className="text-sm text-slate-500">Select a real Dograh workflow and save the Twilio caller ID connected in Dograh.</p>
              </div>
              <button type="button" className="rounded-lg border border-slate-200 p-2" onClick={() => setConnectOpen(false)}><X size={18} /></button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                Select Dograh Workflow
                <select className="mt-1" value={selectedWorkflowValue} onChange={(event) => selectWorkflow(event.target.value)}>
                  <option value="">Choose workflow</option>
                  {workflows.map((workflow) => (
                    <option key={workflowUuid(workflow) || workflowId(workflow)} value={workflowUuid(workflow) || workflowId(workflow)}>
                      {workflowName(workflow)}
                    </option>
                  ))}
                </select>
              </label>
              <Input label="Dograh Workflow ID" name="dograhWorkflowId" value={connectForm.dograhWorkflowId} setForm={setConnectForm} />
              <Input label="Dograh Workflow UUID" name="dograhWorkflowUuid" value={connectForm.dograhWorkflowUuid} setForm={setConnectForm} />
              <Input label="Connected Phone Number" name="connectedPhoneNumber" value={connectForm.connectedPhoneNumber} setForm={setConnectForm} example="+17578297060" />
              <Input label="Caller ID Number" name="callerIdNumber" value={connectForm.callerIdNumber} setForm={setConnectForm} example="+17578297060" />
              <Input label="Provider" name="telephonyProvider" value={connectForm.telephonyProvider} setForm={setConnectForm} />
              <Input label="Workflow Name" name="dograhWorkflowName" value={connectForm.dograhWorkflowName} setForm={setConnectForm} />
            </div>

            <div className="mt-6 action-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setConnectOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={connecting}>{connecting ? "Connecting..." : "Connect Workflow"}</button>
            </div>
          </form>
        </div>
      )}

      {webCallOpen && (
        <WebCallModal agent={agent} onClose={() => setWebCallOpen(false)} />
      )}

      {selectedCall && (
        <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-900/40 p-4" onClick={() => setSelectedCall(null)}>
          <div className="modal-panel rounded-3xl bg-white p-4 shadow-soft sm:max-w-4xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-ink">Call Details</h2>
                <p className="text-sm text-slate-500">{agent.agentName} call record from Dograh.</p>
              </div>
              <button type="button" className="rounded-lg border border-slate-200 p-2" onClick={() => setSelectedCall(null)}><X size={18} /></button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Agent" value={agent.agentName} />
              <Info label="Status" value={selectedCall.status} />
              <Info label="Caller Number" value={selectedCall.callerNumber} />
              <Info label="Calling Number" value={selectedCall.callingNumber} />
              <Info label="Duration" value={formatDuration(selectedCall)} />
              <Info label="Dograh Run ID" value={selectedCall.dograhRunId} />
              <Info label="Dograh Workflow ID" value={selectedCall.dograhWorkflowId} />
              <Info label="Dograh Workflow UUID" value={selectedCall.dograhWorkflowUuid} />
              <Info label="Start Time" value={selectedCall.startedAt ? new Date(selectedCall.startedAt).toLocaleString() : ""} />
              <Info label="End Time" value={selectedCall.endedAt ? new Date(selectedCall.endedAt).toLocaleString() : ""} />
            </div>

            {selectedCall.recordingUrl && (
              <div className="mt-4 rounded-lg border border-slate-200 p-4">
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Recording</p>
                <audio className="w-full" controls src={selectedCall.recordingUrl} />
                <a className="mt-2 inline-block text-sm font-semibold text-brand-700" href={selectedCall.recordingUrl} target="_blank">Open recording</a>
              </div>
            )}

            {selectedCall.transcriptUrl && (
              <div className="mt-4 rounded-lg border border-slate-200 p-4">
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Transcript Link</p>
                <a className="text-sm font-semibold text-brand-700" href={selectedCall.transcriptUrl} target="_blank">Open transcript</a>
              </div>
            )}

            <DetailBlock title="Summary" value={selectedCall.summary || "No summary from Dograh"} />
            <DetailBlock title="Transcript" value={selectedCall.transcript} />
            <DetailBlock title="Lead Data" value={selectedCall.leadData ? JSON.stringify(selectedCall.leadData, null, 2) : "No extracted lead data returned by Dograh."} pre />
            {!selectedCall.leadData && (
              <button
                className="btn-secondary mt-4"
                onClick={() => extractLead(selectedCall._id)}
              >
                Extract Lead
              </button>
            )}

            <details className="mt-4 rounded-lg border border-slate-200 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Raw debug data</summary>
              <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify({
                  rawDograhPayload: selectedCall.rawDograhPayload,
                  rawWebhookPayload: selectedCall.rawWebhookPayload,
                  rawRunDetails: selectedCall.rawRunDetails
                }, null, 2)}
              </pre>
            </details>

            <div className="mt-6 action-row sm:justify-end">
              <button className="btn-secondary" onClick={() => extractLead(selectedCall._id)}>Extract Lead</button>
              <button className="btn-secondary" onClick={() => syncCall(selectedCall._id)}><RefreshCw size={16} />Sync</button>
              <button className="btn-primary" onClick={() => setSelectedCall(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WebCallModal({ agent, onClose }) {
  const DOGRAH_WIDGET_SCRIPT_URL = "https://app.dograh.com/embed/dograh-widget.js?token=emb_2DZCqJaCmKrPiXuOXAyckWj6OPSlG8RFsr3oOzuUmxE&environment=production&apiEndpoint=https://api.dograh.com";
  const [callState, setCallState] = useState("starting");
  const [transcript, setTranscript] = useState([]);
  const [message, setMessage] = useState("");
  const [callId, setCallId] = useState("");
  const [providerCallId, setProviderCallId] = useState("");
  const [dograhSession, setDograhSession] = useState(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const startedAtRef = useRef(null);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const endingRef = useRef(false);
  const transcriptRef = useRef([]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    startCall();

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopMicStream();
    };
  }, []);

  useEffect(() => {
    function handleDograhWidgetMessage(event) {
      const data = event.data || {};
      const type = String(data.type || data.event || "");

      if (!type.toLowerCase().includes("dograh") && !type.toLowerCase().includes("call")) return;

      if (["dograh:speaking", "call:speaking", "speaking"].includes(type)) {
        setSpeaking(Boolean(data.speaking ?? true));
      }

      if (["dograh:speech_ended", "call:speech_ended", "speech_ended"].includes(type)) {
        setSpeaking(false);
      }

      if (["dograh:transcript", "call:transcript", "transcript"].includes(type) && data.text) {
        setTranscript((current) => [
          ...current,
          {
            role: ["user", "assistant"].includes(data.role) ? data.role : "assistant",
            text: String(data.text),
            timestamp: new Date().toISOString()
          }
        ]);
      }

      if (["dograh:ended", "call:ended", "ended"].includes(type)) {
        endCall();
      }
    }

    window.addEventListener("message", handleDograhWidgetMessage);
    return () => window.removeEventListener("message", handleDograhWidgetMessage);
  }, [callId, providerCallId]);

  function setFriendlyError(text) {
    setMessage(formatErrorText(text, "Failed to start Dograh web call"));
    setCallState("failed");
  }

  function formatErrorText(value, fallback = "Failed to start Dograh web call") {
    if (!value) return fallback;
    if (typeof value === "string") return value;
    if (value instanceof Error) return formatErrorText(value.message, fallback);
    if (typeof value !== "object") return String(value);

    const nested =
      value.message ||
      value.error ||
      value.detail ||
      value.details ||
      value.data?.message ||
      value.data?.error ||
      value.data?.detail ||
      value.data?.details;

    if (nested && nested !== value) return formatErrorText(nested, fallback);

    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  function readApiErrorMessage(error, fallback = "Failed to start Dograh web call") {
    const apiMessage = error.response?.message || error.response?.data?.message || "";
    if (error.status === 404 && String(apiMessage).includes("/api/dograh/web-call")) {
      return "Dograh web call backend route not found.";
    }

    const details = error.response?.details ?? error.response?.data?.details;
    return formatErrorText(
      apiMessage ||
      details ||
      error.message ||
      error.response ||
      fallback,
      fallback
    );
  }

  function getDograhWidget() {
    return window.DograhWidget || window.dograhWidget || null;
  }

  function loadDograhWidgetScript() {
    if (getDograhWidget()) return Promise.resolve(getDograhWidget());

    return new Promise((resolve, reject) => {
      const existing = document.getElementById("dograh-widget");
      if (existing) {
        existing.addEventListener("load", () => resolve(getDograhWidget()));
        existing.addEventListener("error", () => reject(new Error("Dograh widget script failed to load.")));
        return;
      }

      const script = document.createElement("script");
      script.id = "dograh-widget";
      script.src = DOGRAH_WIDGET_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        const widget = getDograhWidget();
        if (!widget) reject(new Error("Dograh widget script loaded, but window.DograhWidget was not found."));
        else resolve(widget);
      };
      script.onerror = () => reject(new Error("Dograh widget script failed to load."));
      document.body.appendChild(script);
    });
  }

  function readDograhCallbackToken(callback) {
    return callback?.token ||
      callback?.session_token ||
      callback?.sessionToken ||
      callback?.callId ||
      callback?.call_id ||
      callback?.runId ||
      callback?.run_id ||
      "";
  }

  function registerDograhWidgetCallbacks(widget) {
    if (!widget) return;

    widget.onCallConnected?.((callback) => {
      console.log("Dograh call connected:", callback);
      const token = readDograhCallbackToken(callback);
      if (token) setProviderCallId(token);
      setDograhSession((current) => ({ ...current, connected: true, callback }));
      setSpeaking(false);
      setCallState("live");
    });

    widget.onCallDisconnected?.((callback) => {
      console.log("Dograh call disconnected:", callback);
      const token = readDograhCallbackToken(callback);
      if (token) setProviderCallId(token);
      if (Array.isArray(callback?.transcript)) setTranscript(callback.transcript);
      if (callback?.transcript && typeof callback.transcript === "string") {
        setTranscript([{ role: "assistant", text: callback.transcript, timestamp: new Date().toISOString() }]);
      }
      endCall(token);
    });

    widget.onTranscript?.((callback) => {
      if (!callback?.text) return;
      setTranscript((current) => [
        ...current,
        {
          role: ["user", "assistant"].includes(callback.role) ? callback.role : "assistant",
          text: String(callback.text),
          timestamp: new Date().toISOString()
        }
      ]);
    });
  }

  async function initializeDograhWidget(widget, config) {
    if (!widget) throw new Error("Dograh widget is not available.");

    registerDograhWidgetCallbacks(widget);

    if (typeof widget.init === "function") return widget.init(config);
    if (typeof widget.initialize === "function") return widget.initialize(config);
    if (typeof widget.configure === "function") return widget.configure(config);

    return null;
  }

  async function startDograhWidgetCall(widget, config) {
    if (typeof widget.startCall === "function") return widget.startCall(config);
    if (typeof widget.open === "function") return widget.open(config);
    if (typeof widget.start === "function") return widget.start(config);
    if (typeof widget.call === "function") return widget.call(config);
    throw new Error("Dograh widget loaded, but no start call method was found.");
  }

  async function requestMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      return stream;
    } catch {
      throw new Error("Mic permission denied");
    }
  }

  function stopMicStream() {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function toggleMute() {
    const nextMuted = !muted;
    streamRef.current?.getAudioTracks?.().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
    const widget = getDograhWidget();
    if (nextMuted) {
      widget?.mute?.();
      widget?.setMuted?.(true);
    } else {
      widget?.unmute?.();
      widget?.setMuted?.(false);
    }
  }

  async function startCall() {
    setMessage("");
    setCallState("starting");
    setDograhSession(null);
    setSeconds(0);
    setMuted(false);
    setSpeaking(false);
    endingRef.current = false;
    stopMicStream();

    try {
      const agentId = agent?._id || agent?.id;

      console.log("Starting Dograh web call for agent:", agent);

      if (!agentId) {
        setFriendlyError("Agent ID missing. Cannot start Dograh web call.");
        return;
      }

      const result = await api("/dograh/web-call/start", {
        method: "POST",
        body: { agentId }
      });

      setCallId(result.callId || "");
      setProviderCallId(result.dograh?.providerCallId || "");
      setDograhSession(result.dograh || null);

      await requestMicPermission();
      const widget = await loadDograhWidgetScript();
      console.log("DograhWidget methods:", Object.keys(window.DograhWidget || {}));
      const widgetConfig = {
        ...(result.dograh?.widgetConfig || {}),
        workflowId: result.dograh?.workflowId || result.dograh?.widgetConfig?.workflowId,
        workflow_id: result.dograh?.workflowId || result.dograh?.widgetConfig?.workflow_id,
        localCallId: result.callId
      };
      await initializeDograhWidget(widget, widgetConfig);

      startedAtRef.current = Date.now();
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 1000);

      await startDograhWidgetCall(widget, widgetConfig);
      setCallState("live");
    } catch (err) {
      setFriendlyError(readApiErrorMessage(err));
    }
  }

  async function endCall(callbackProviderCallId = providerCallId) {
    if (endingRef.current) return;
    endingRef.current = true;

    const duration = startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : seconds;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    stopMicStream();
    const widget = getDograhWidget();
    widget?.endCall?.();
    widget?.disconnect?.();
    widget?.close?.();
    setSpeaking(false);
    setCallState("ended");
    setSeconds(duration);

    if (!callId) return;

    try {
      const result = await api("/dograh/web-call/end", {
        method: "POST",
        body: {
          callId,
          providerCallId: callbackProviderCallId,
          transcript: transcriptRef.current,
          duration
        }
      });
      setTranscript(result.webCall?.transcript || transcriptRef.current);
    } catch (err) {
      setMessage(readApiErrorMessage(err, "Web call failed"));
    }
  }

  const inCall = callState === "starting" || callState === "live";
  async function closeModal() {
    if (inCall) await endCall();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-3 sm:p-4" onClick={closeModal}>
      <div className="modal-panel rounded-2xl bg-white shadow-soft" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dograh Web Call</p>
            <h2 className="break-anywhere text-lg font-bold text-ink">{agent.agentName || agent.name}</h2>
          </div>
          <button type="button" className="rounded-lg border border-slate-200 p-2" onClick={closeModal} aria-label="Close web call">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live status</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${callState === "live" ? "bg-emerald-500" : callState === "failed" ? "bg-rose-500" : "bg-slate-300"}`} />
                  <span className="text-sm font-bold capitalize text-slate-800">{callState}</span>
                </div>
              </div>
              <span className="badge bg-emerald-50 text-emerald-700">Dograh</span>
            </div>

            <div className="grid min-h-72 place-items-center rounded-2xl bg-white p-6 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-brand-50 text-brand-700">
                <Headphones size={30} />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-800">
                {callState === "starting" ? "Starting Dograh web call" : callState === "failed" ? "Dograh web call unavailable" : "Dograh session ready"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Dograh handles browser voice, transcript, and recording.</p>
              {dograhSession?.widgetConfig && (
                <p className="mt-3 break-anywhere rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Dograh widget config ready. The widget will handle session token generation.
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
              </div>
              <div className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                {speaking ? "Speaking" : muted ? "Muted" : callState === "live" ? "Listening" : "Ready"}
              </div>
            </div>

            {message && (
              <div className={`mt-4 rounded-lg p-3 text-sm ${callState === "failed" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                {message}
              </div>
            )}

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button className="btn-secondary" disabled={callState !== "live"} onClick={toggleMute}>
                {muted ? <Mic size={16} /> : <MicOff size={16} />}
                {muted ? "Unmute" : "Mute"}
              </button>
              <button className="btn-secondary" disabled={callState !== "failed"} onClick={startCall}>
                <RefreshCw size={16} />
                Retry
              </button>
              <button className="btn-danger" disabled={callState === "ended"} onClick={endCall}>
                <Square size={16} />
                End Call
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-bold text-ink">Live transcript</h3>
              <span className="badge bg-slate-100 text-slate-600">{transcript.length} lines</span>
            </div>
            <div className="max-h-[28rem] min-h-72 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
              {transcript.map((item, index) => (
                <div key={`${item.role}-${index}`} className={`rounded-xl p-3 text-sm ${item.role === "assistant" ? "bg-white text-slate-800" : "bg-brand-600 text-white"}`}>
                  <p className={`mb-1 text-xs font-semibold uppercase ${item.role === "assistant" ? "text-slate-400" : "text-brand-100"}`}>
                    {item.role === "assistant" ? agent.agentName || "Agent" : "You"}
                  </p>
                  <p className="whitespace-pre-wrap break-anywhere">{item.text}</p>
                </div>
              ))}
              {!transcript.length && (
                <div className="grid min-h-60 place-items-center text-center text-sm text-slate-500">
                  Dograh transcript appears here after the call ends when the API returns transcript data.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Input({ label, name, value, setForm, example }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input className="mt-1" value={value} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} />
      {example && <span className="mt-1 block text-xs text-slate-500">Example: {example}</span>}
    </label>
  );
}

function Info({ label, value }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="break-words text-sm text-slate-700">{value || "Not provided"}</p>
    </div>
  );
}

function DetailBlock({ title, value, pre = false }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-4">
      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{title}</p>
      {pre ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{value || "Not provided"}</pre>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-slate-700">{value || "Not provided"}</p>
      )}
    </div>
  );
}
