import { Cable, MessageCircle, PhoneCall, Play, Radio, RefreshCw, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

function workflowId(workflow) {
  return workflow.id || workflow.workflow_id || workflow.workflowId || workflow._id || "";
}

function workflowUuid(workflow) {
  return workflow.uuid || workflow.workflow_uuid || workflow.workflowUuid || "";
}

function workflowName(workflow) {
  return workflow.name || workflow.workflow_name || workflow.title || workflow.workflowName || "Untitled workflow";
}

export default function AgentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [calls, setCalls] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const [debugResponse, setDebugResponse] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [callLoading, setCallLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
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
    load();
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
      setWorkflows(readWorkflowList(await api("/dograh/workflows")));
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
      setNotice(type === "test" ? "Test call triggered through Dograh." : "Outbound call triggered through Dograh.");
      await load();
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    } finally {
      setCallLoading(false);
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
      const result = await api(`/agents/${id}/test`, {
        method: "POST",
        body: { message: text }
      });

      setChatMessages((current) => [...current, { role: "assistant", text: result.response }]);
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
      setChatMessages((current) => [...current, { role: "assistant", text: "Message failed. Check backend Gemini configuration and try again.", error: true }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function removeAgent() {
    if (!confirm("Delete this agent?")) return;
    await api(`/agents/${id}`, { method: "DELETE" });
    navigate("/agents");
  }

  async function action(type) {
    await api(`/agents/${id}/${type}`, { method: "POST" });
    load();
  }

  const connected = Boolean(agent?.dograhWorkflowUuid);
  const selectedWorkflowValue = useMemo(() => connectForm.dograhWorkflowUuid || connectForm.dograhWorkflowId, [connectForm]);

  return (
    <>
      <PageHeader
        title={agent?.agentName || "Agent Details"}
        description={agent ? `${agent.agentType} for ${agent.businessName}` : "Loading agent..."}
        action={agent && <StatusBadge status={agent.status} />}
      />

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

      {agent && (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className="card">
              <div className="mb-4 flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={openConnectModal}><Cable size={16} />Connect Dograh Workflow</button>
                <a className="btn-secondary" href="#message-test"><MessageCircle size={16} />Message Test</a>
                <button className="btn-secondary" disabled={callLoading || !connected} onClick={() => triggerCall("test")}><PhoneCall size={16} />Test Call</button>
                <button className="btn-secondary" disabled={callLoading || !connected} onClick={() => triggerCall("outbound")}><Radio size={16} />Outbound Call</button>
                <button className="btn-secondary" onClick={() => action("publish")}><Play size={16} />Publish</button>
                <button className="btn-secondary text-rose-600" onClick={removeAgent}><Trash2 size={16} />Delete</button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Info label="Business" value={agent.businessName} />
                <Info label="Category" value={agent.businessCategory} />
                <Info label="Location" value={agent.businessLocation} />
                <Info label="Working Hours" value={agent.workingHours} />
                <Info label="Contact" value={agent.contactNumber} />
                <Info label="Dograh Connection" value={connected ? "Connected" : "Not connected"} />
              </div>
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

              <form className="flex gap-2" onSubmit={sendChatMessage}>
                <input value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} />
                <button className="btn-primary" disabled={chatLoading}>
                  <Send size={16} />
                  {chatLoading ? "Sending..." : "Send"}
                </button>
              </form>
            </div>

            <div className="card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-bold text-ink">Call Logs</h2>
                <button className="btn-secondary" onClick={load}><RefreshCw size={16} />Refresh</button>
              </div>
              <div className="overflow-auto">
                <table className="table w-full min-w-[840px]">
                  <thead>
                    <tr><th>Caller</th><th>Calling Number</th><th>Status</th><th>Duration</th><th>Summary</th><th>Transcript</th><th>Recording</th><th>Created</th></tr>
                  </thead>
                  <tbody>
                    {calls.map((call) => (
                      <tr key={call._id}>
                        <td>{call.callerNumber || "-"}</td>
                        <td>{call.callingNumber || "-"}</td>
                        <td>{call.status || "-"}</td>
                        <td>{call.duration || 0}s</td>
                        <td>{call.summary || "-"}</td>
                        <td>{call.transcript || "-"}</td>
                        <td>{call.recordingUrl ? <a className="text-brand-700" href={call.recordingUrl} target="_blank">Open</a> : "-"}</td>
                        <td>{new Date(call.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                    {!calls.length && <tr><td colSpan="8" className="text-center text-slate-500">No calls yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {debugResponse && (
              <div className="card">
                <h2 className="mb-3 font-bold text-ink">Dograh response debug</h2>
                <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(debugResponse, null, 2)}</pre>
              </div>
            )}

            <div className="card">
              <h2 className="mb-3 font-bold text-ink">System prompt preview</h2>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-sm text-slate-100">{agent.systemPrompt}</pre>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="card">
              <h2 className="mb-3 font-bold text-ink">Dograh workflow</h2>
              <Info label="Workflow Name" value={agent.dograhWorkflowName} />
              <Info label="Workflow ID" value={agent.dograhWorkflowId} />
              <Info label="Workflow UUID" value={agent.dograhWorkflowUuid} />
              <Info label="Connected Phone Number" value={agent.connectedPhoneNumber} />
              <Info label="Caller ID Number" value={agent.callerIdNumber} />
              <Info label="Telephony Provider" value={agent.telephonyProvider} />
              <Info label="Dograh Status" value={agent.dograhStatus} />
            </div>

            <div className="card">
              <h2 className="mb-3 font-bold text-ink">Voice settings</h2>
              <Info label="Language" value={agent.language} />
              <Info label="Gender" value={agent.voiceGender} />
              <Info label="Tone" value={agent.tone} />
              <Info label="Personality" value={agent.personality} />
            </div>

            <div className="card">
              <h2 className="mb-3 font-bold text-ink">Webhook</h2>
              <Info label="Dograh Webhook URL" value="http://localhost:5000/api/webhooks/dograh" />
            </div>
          </aside>
        </div>
      )}

      {connectOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={() => setConnectOpen(false)}>
          <form className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-soft" onSubmit={connectWorkflow} onClick={(event) => event.stopPropagation()}>
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

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConnectOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={connecting}>{connecting ? "Connecting..." : "Connect Workflow"}</button>
            </div>
          </form>
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

function Info({ label, value }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="break-words text-sm text-slate-700">{value || "Not provided"}</p>
    </div>
  );
}
