import { Cable, CalendarClock, Copy, Edit, Eye, Globe2, Headphones, MessageCircle, PhoneCall, Play, Radio, RefreshCw, Send, Share2, Square, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";
import { loadDograhWidget } from "../utils/loadDograhWidget.js";

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

function formatApiError(error) {
  const response = error?.response;
  if (response?.userMessage) return response.userMessage;
  if (response?.message) return response.message;
  if (typeof response?.details === "string") return response.details;
  return error?.message || "Something went wrong.";
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

export default function AgentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [calls, setCalls] = useState([]);
  const [scheduledCalls, setScheduledCalls] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const [debugResponse, setDebugResponse] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [callLoading, setCallLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [dograhEmbedToken, setDograhEmbedToken] = useState("");
  const [dograhWidgetLoading, setDograhWidgetLoading] = useState(false);
  const [dograhCallStatus, setDograhCallStatus] = useState("idle");
  const [dograhCallError, setDograhCallError] = useState("");
  const [shareSaving, setShareSaving] = useState(false);
  const [shareForm, setShareForm] = useState({
    isPublic: false,
    publicChatEnabled: true,
    publicWebCallEnabled: false,
    publicTitle: "",
    publicDescription: "",
    publicWelcomeMessage: ""
  });
  const [runSyncForm, setRunSyncForm] = useState({ workflowId: "", runId: "", callLogId: "" });
  const [scheduleForm, setScheduleForm] = useState({
    phoneNumber: "",
    scheduledForLocal: defaultLocalDateTime(),
    timezone: defaultTimezone()
  });
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
      const [agentData, callData, scheduleData] = await Promise.all([
        api(`/agents/${id}`),
        api(`/agents/${id}/calls`),
        api(`/scheduled-calls/agent/${id}`)
      ]);
      setData(agentData);
      setCalls(callData);
      setScheduledCalls(scheduleData);
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

  useEffect(() => {
    setDograhEmbedToken(agent?.dograhEmbedToken || "");
    setDograhCallStatus("idle");
    setDograhCallError("");
  }, [agent?._id, agent?.dograhEmbedToken]);

  useEffect(() => {
    if (!agent) return;
    setShareForm({
      isPublic: Boolean(agent.isPublic),
      publicChatEnabled: agent.publicChatEnabled !== false,
      publicWebCallEnabled: Boolean(agent.publicWebCallEnabled),
      publicTitle: agent.publicTitle || agent.businessName || agent.agentName || "",
      publicDescription: agent.publicDescription || agent.businessDescription || agent.description || "",
      publicWelcomeMessage: agent.publicWelcomeMessage || agent.greetingMessage || agent.firstMessage || ""
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

    setSelectedCall(null);
    setNotice("Repeat call details added to schedule form.");
    window.location.hash = "scheduled-calls";
    document.getElementById("scheduled-calls")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      setError(formatApiError(err));
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
      setError(formatApiError(err));
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
      setError(formatApiError(err));
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
      setError(formatApiError(err));
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
      setError(formatApiError(err));
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
      setError(formatApiError(err));
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
      setError(formatApiError(err));
    } finally {
      setCallLoading(false);
    }
  }

  async function copyCallbackLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/call/${id}`);
    setNotice("Callback link copied.");
  }

  function setShareField(name, value) {
    setShareForm((current) => ({ ...current, [name]: value }));
  }

  async function saveShareSettings(nextForm = shareForm) {
    setShareSaving(true);
    setError("");
    setNotice("");

    try {
      const result = await api(`/agents/${id}/share-settings`, {
        method: "PATCH",
        body: nextForm
      });
      setData((current) => ({ ...current, agent: result.agent || current.agent }));
      setNotice("Share settings saved.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setShareSaving(false);
    }
  }

  async function toggleShareField(name) {
    const nextForm = { ...shareForm, [name]: !shareForm[name] };
    setShareForm(nextForm);
    await saveShareSettings(nextForm);
  }

  async function copyPublicLink() {
    await navigator.clipboard.writeText(publicUrl);
    setNotice("Agent link copied.");
  }

  function registerDograhWidgetCallbacks(widget) {
    if (!widget) return;

    widget.onCallConnected?.((payload) => {
      console.log("Dograh call connected:", payload);
      setDograhCallStatus("connected");
    });

    widget.onCallDisconnected?.((payload) => {
      console.log("Dograh call disconnected:", payload);
      setDograhCallStatus("ended");
    });

    widget.onCallEnd?.((payload) => {
      console.log("Dograh call end:", payload);
      setDograhCallStatus("ended");
    });

    widget.onError?.((error) => {
      console.error("Dograh widget error:", error);
      setDograhCallError(error?.message || "Dograh web call failed.");
      setDograhCallStatus("error");
    });

    widget.onStatusChange?.((status) => {
      console.log("Dograh status:", status);
      setDograhCallStatus(status || "idle");
    });
  }

  function readDograhCallError(error) {
    const details = error?.response?.details;
    const dograhError = error?.response?.dograhError;

    if (typeof details === "string") return details;
    if (details && typeof details === "object") return JSON.stringify(details);
    if (typeof dograhError === "string") return dograhError;
    if (dograhError && typeof dograhError === "object") return JSON.stringify(dograhError);

    return error?.message || "Dograh web call failed.";
  }

  async function enableDograhWebCalling() {
    setDograhWidgetLoading(true);
    setDograhCallError("");
    setNotice("");

    try {
      const result = await api(`/agents/${id}/dograh/embed-token`, { method: "POST" });
      setDograhEmbedToken(result.embedToken || "");
      setData((current) => ({ ...current, agent: result.agent || current.agent }));
      const widget = await loadDograhWidget(result.embedToken);
      registerDograhWidgetCallbacks(widget);
      setNotice("Dograh web calling enabled.");
      setDograhCallStatus("ready");
    } catch (err) {
      setDograhCallError(readDograhCallError(err));
      setDograhCallStatus("error");
    } finally {
      setDograhWidgetLoading(false);
    }
  }

  async function disableDograhWebCalling() {
    setDograhWidgetLoading(true);
    setDograhCallError("");
    setNotice("");

    try {
      await window.DograhWidget?.end?.();
      const result = await api(`/agents/${id}/dograh/embed-token`, { method: "DELETE" });
      setDograhEmbedToken("");
      setData((current) => ({ ...current, agent: result.agent || { ...current.agent, dograhEmbedToken: "", dograhWidgetEnabled: false } }));
      document.getElementById("dograh-widget")?.remove();
      delete window.DograhWidget;
      setDograhCallStatus("disabled");
      setNotice("Dograh web calling disabled.");
    } catch (err) {
      setDograhCallError(readDograhCallError(err));
      setDograhCallStatus("error");
    } finally {
      setDograhWidgetLoading(false);
    }
  }

  async function startDograhWebCall() {
    setDograhCallError("");
    setDograhCallStatus("connecting");

    try {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStream.getTracks().forEach((track) => track.stop());
      } catch {
        throw new Error("Microphone permission denied.");
      }

      const token = dograhEmbedToken || agent?.dograhEmbedToken;
      const widget = await loadDograhWidget(token);
      registerDograhWidgetCallbacks(widget);

      if (typeof widget.start !== "function") {
        throw new Error("DograhWidget.start() method not found.");
      }

      await widget.start();
    } catch (err) {
      setDograhCallError(readDograhCallError(err));
      setDograhCallStatus("error");
    }
  }

  async function endDograhWebCall() {
    try {
      await window.DograhWidget?.end?.();
      setDograhCallStatus("ended");
    } catch (err) {
      setDograhCallError(readDograhCallError(err));
      setDograhCallStatus("error");
    }
  }

  const connected = Boolean(agent?.dograhWorkflowUuid);
  const dograhWebCallingEnabled = Boolean(dograhEmbedToken || agent?.dograhWidgetEnabled);
  const publicUrl = agent?.publicSlug ? `${window.location.origin}/a/${agent.publicSlug}` : "";
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
                  ["Scheduled Calls", "#scheduled-calls"],
                  ["Call Logs", "#call-logs"],
                  ["Leads", "/leads"],
                  ["Dograh Web Calling", "#dograh-web-calling"],
                  ["Share Agent", "#share-agent"],
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
                <button className="btn-secondary" disabled={callLoading || !connected} onClick={() => triggerCall("test")}><PhoneCall size={16} />Test Call</button>
                <button className="btn-secondary" disabled={callLoading || !connected} onClick={() => triggerCall("outbound")}><Radio size={16} />Outbound Call</button>
                <a className="btn-secondary" href="#scheduled-calls"><CalendarClock size={16} />Schedule Call</a>
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

            <div id="scheduled-calls" className="card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-ink">Scheduled Calls</h2>
                </div>
                <CalendarClock className="text-brand-700" size={20} />
              </div>

              <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={scheduleCall}>
                <label className="block text-sm font-medium text-slate-700">
                  Phone Number
                  <input className="mt-1" required placeholder="+918000000000" value={scheduleForm.phoneNumber} onChange={(event) => setScheduleField("phoneNumber", event.target.value)} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Date and Time
                  <input className="mt-1" required type="datetime-local" value={scheduleForm.scheduledForLocal} onChange={(event) => setScheduleField("scheduledForLocal", event.target.value)} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Timezone
                  <input className="mt-1" required value={scheduleForm.timezone} onChange={(event) => setScheduleField("timezone", event.target.value)} />
                </label>
                <button className="btn-primary self-end" disabled={scheduleLoading || !connected}>
                  <CalendarClock size={16} />{scheduleLoading ? "Saving..." : "Schedule"}
                </button>
              </form>

              <div className="mt-5 grid gap-3">
                {scheduledCalls.map((schedule) => (
                  <article key={schedule._id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-anywhere font-semibold text-ink">{schedule.phoneNumber}</p>
                        <p className="text-sm text-slate-500">{formatScheduleTime(schedule)} · {schedule.timezone}</p>
                        {schedule.lastError && <p className="mt-1 text-xs text-rose-700">{schedule.lastError}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={schedule.status} />
                        {schedule.status === "pending" && (
                          <button className="btn-secondary px-3 py-1.5 text-xs" disabled={scheduleLoading} onClick={() => cancelScheduledCall(schedule._id)}>Cancel</button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
                {!scheduledCalls.length && <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No scheduled calls.</div>}
              </div>
            </div>

            <div id="dograh-web-calling" className="card">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-ink">Dograh Web Calling</h2>
                  <p className="text-sm text-slate-500">Browser calls use a Dograh embed token managed by the backend.</p>
                </div>
                <span className={`badge ${dograhWebCallingEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                  {dograhWebCallingEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Call status</p>
                  <p className="text-sm font-semibold capitalize text-slate-800">{dograhCallStatus}</p>
                </div>
                <div className="action-row">
                  <button className="btn-secondary" disabled={dograhWidgetLoading || dograhWebCallingEnabled} onClick={enableDograhWebCalling}>
                    <RefreshCw size={16} />
                    Enable Web Calling
                  </button>
                  <button className="btn-secondary" disabled={dograhWidgetLoading || !dograhWebCallingEnabled} onClick={disableDograhWebCalling}>
                    <Trash2 size={16} />
                    Disable Web Calling
                  </button>
                  <button className="btn-primary" disabled={!dograhWebCallingEnabled || dograhCallStatus === "connecting" || dograhCallStatus === "connected"} onClick={startDograhWebCall}>
                    <Headphones size={16} />
                    Start Call
                  </button>
                  <button className="btn-secondary" disabled={dograhCallStatus !== "connected"} onClick={endDograhWebCall}>
                    <Square size={16} />
                    End Call
                  </button>
                </div>
              </div>

              {dograhCallError && (
                <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  {dograhCallError}
                </div>
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
                      <button className="btn-secondary" disabled={!call.callerNumber} onClick={() => repeatCall(call)}><RefreshCw size={14} />Repeat</button>
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
                            <button className="btn-secondary px-3 py-1.5 text-xs" disabled={!call.callerNumber} onClick={() => repeatCall(call)}><RefreshCw size={14} />Repeat</button>
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

            <div id="share-agent" className="card">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-ink">Share Agent</h2>
                  <p className="text-sm text-slate-500">Publish a public page for this agent.</p>
                </div>
                <Globe2 className={shareForm.isPublic ? "text-emerald-600" : "text-slate-400"} size={20} />
              </div>

              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Public URL</p>
                <p className="break-anywhere text-sm font-semibold text-slate-800">{publicUrl || "Generated when the agent is saved."}</p>
              </div>

              <div className="mb-4 grid gap-2">
                <ShareToggle label="Public" checked={shareForm.isPublic} disabled={shareSaving} onChange={() => toggleShareField("isPublic")} />
                <ShareToggle label="Chat" checked={shareForm.publicChatEnabled} disabled={shareSaving} onChange={() => toggleShareField("publicChatEnabled")} />
                <ShareToggle label="Web Call" checked={shareForm.publicWebCallEnabled} disabled={shareSaving || !dograhWebCallingEnabled} onChange={() => toggleShareField("publicWebCallEnabled")} />
              </div>
              {!dograhWebCallingEnabled && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">Enable Dograh web calling before turning on public web calls.</p>}

              <div className="space-y-3">
                <Input label="Public Title" name="publicTitle" value={shareForm.publicTitle} setForm={setShareForm} />
                <label className="block text-sm font-medium text-slate-700">
                  Public Description
                  <textarea className="mt-1" value={shareForm.publicDescription} onChange={(event) => setShareField("publicDescription", event.target.value)} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Welcome Message
                  <textarea className="mt-1" value={shareForm.publicWelcomeMessage} onChange={(event) => setShareField("publicWelcomeMessage", event.target.value)} />
                </label>
              </div>

              <div className="mt-4 action-row">
                <button className="btn-primary" disabled={shareSaving} onClick={() => saveShareSettings()}>
                  <Share2 size={16} />
                  {shareSaving ? "Saving..." : "Save"}
                </button>
                <button className="btn-secondary" disabled={!publicUrl} onClick={copyPublicLink}>
                  <Copy size={16} />
                  Copy Link
                </button>
                {publicUrl && <a className="btn-secondary" href={publicUrl} target="_blank"><Eye size={16} />Preview</a>}
              </div>
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
              <button className="btn-secondary" disabled={!selectedCall.callerNumber} onClick={() => repeatCall(selectedCall)}><RefreshCw size={16} />Repeat</button>
              <button className="btn-secondary" onClick={() => syncCall(selectedCall._id)}><RefreshCw size={16} />Sync</button>
              <button className="btn-primary" onClick={() => setSelectedCall(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
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

function ShareToggle({ label, checked, disabled, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      <input className="h-5 w-5 rounded border-slate-300" type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
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
