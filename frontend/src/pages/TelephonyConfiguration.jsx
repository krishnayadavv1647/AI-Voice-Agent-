import { CheckCircle2, PhoneCall, PlugZap, Save, Trash2, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const providers = [
  { value: "twilio", label: "Twilio" },
  { value: "exotel", label: "Exotel" },
  { value: "vonage", label: "Vonage" }
];

const emptyForm = {
  _id: "",
  name: "",
  provider: "twilio",
  phoneNumber: "",
  accountSid: "",
  authToken: "",
  apiKey: "",
  apiSecret: "",
  appId: "",
  region: "",
  country: "",
  webhookUrl: "",
  linkedAgentId: "",
  inboundEnabled: true,
  inboundMode: "dograh_ai",
  outboundEnabled: true,
  status: "active"
};

function formatApiError(error) {
  const response = error?.response;
  if (response?.userMessage) return response.userMessage;
  if (response?.message) return response.message;
  if (typeof response?.details === "string") return response.details;
  return error?.message || "Something went wrong.";
}

export default function TelephonyConfiguration() {
  const [configs, setConfigs] = useState([]);
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const providerLabel = useMemo(
    () => providers.find((provider) => provider.value === form.provider)?.label || "Telephony",
    [form.provider]
  );

  useEffect(() => {
    load();
  }, []);

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function load() {
    try {
      const [telephonyConfigs, agentList] = await Promise.all([
        api("/telephony-configs"),
        api("/agents")
      ]);
      setConfigs(telephonyConfigs);
      setAgents(agentList);
    } catch (err) {
      setError(err.message);
    }
  }

  function editConfig(config) {
    setError("");
    setMessage("");
    setForm({
      ...emptyForm,
      ...config,
      linkedAgentId: config.linkedAgentId || "",
      authToken: config.authToken || "",
      apiSecret: config.apiSecret || ""
    });
  }

  function resetForm() {
    setForm({ ...emptyForm, provider: form.provider });
  }

  async function saveConfig() {
    setError("");
    setMessage("");

    if (!form.name || !form.provider || !form.phoneNumber) {
      setError("Configuration name, provider, and phone number are required.");
      return;
    }

    if (!form._id && !form.linkedAgentId) {
      setError("Select a linked agent before adding a Dograh telephony configuration.");
      return;
    }

    setBusy("save");
    try {
      const path = form._id ? `/telephony-configs/${form._id}` : "/telephony-configs";
      const method = form._id ? "PUT" : "POST";
      const payload = {
        ...form,
        linkedAgentId: form.linkedAgentId || null
      };
      const saved = await api(path, { method, body: payload });
      setForm({ ...emptyForm, ...saved, linkedAgentId: saved.linkedAgentId || "" });
      setMessage(`${providerLabel} configuration saved in Dograh and linked locally.`);
      await load();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy("");
    }
  }

  async function testConfig(id = form._id) {
    if (!id) return;
    setError("");
    setMessage("");
    setBusy("test");
    try {
      const result = await api(`/telephony-configs/${id}/test`, { method: "POST", body: {} });
      setMessage(result.result?.message || "Connection test completed.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy("");
    }
  }

  async function configureWebhook(id = form._id) {
    if (!id) return;
    setError("");
    setMessage("");
    setBusy("webhook");
    try {
      const result = await api(`/telephony-configs/${id}/configure-webhook`, { method: "POST", body: {} });
      setMessage(result.result?.message || "Webhook configured.");
      await load();
      if (form._id === id) setForm((current) => ({ ...current, webhookUrl: result.webhookUrl || current.webhookUrl }));
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy("");
    }
  }

  async function verifyInboundRouting(id = form._id) {
    if (!id) return;
    setError("");
    setMessage("");
    setBusy("verifyInbound");
    try {
      const result = await api(`/telephony-configs/${id}/verify-inbound-routing`, { method: "POST", body: {} });
      setMessage(`Inbound routing verified: ${result.routingStatus || "ready"}.`);
      await load();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy("");
    }
  }

  async function deleteConfig(id) {
    if (!confirm("Delete this telephony configuration?")) return;
    setError("");
    setMessage("");
    setBusy("delete");
    try {
      await api(`/telephony-configs/${id}`, { method: "DELETE" });
      setMessage("Telephony configuration deleted.");
      if (form._id === id) resetForm();
      await load();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHeader
        title="Telephony Configuration"
        description="Manage provider numbers, webhooks, and agent links from your app."
      />

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:gap-6">
        <section className="card">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              {providers.map((provider) => (
                <button
                  key={provider.value}
                  className={form.provider === provider.value ? "btn-primary" : "btn-secondary"}
                  onClick={() => setForm((current) => ({ ...current, provider: provider.value }))}
                >
                  <PhoneCall size={16} />{provider.label}
                </button>
              ))}
            </div>
            {form._id && <button className="btn-secondary" onClick={resetForm}>New Config</button>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Configuration Name" value={form.name} onChange={(value) => setField("name", value)} />
            <Field label="Phone Number" value={form.phoneNumber} onChange={(value) => setField("phoneNumber", value)} placeholder="+17578297060" />
            <Field label={form.provider === "twilio" ? "Account SID" : "Account SID / API Key"} value={form.accountSid} onChange={(value) => setField("accountSid", value)} />
            <Field label={form.provider === "twilio" ? "Auth Token" : "Auth Token / API Token"} type="password" value={form.authToken} onChange={(value) => setField("authToken", value)} />
            <Field label="API Key" value={form.apiKey} onChange={(value) => setField("apiKey", value)} />
            <Field label="API Secret" type="password" value={form.apiSecret} onChange={(value) => setField("apiSecret", value)} />
            <Field label="App / Flow ID" value={form.appId} onChange={(value) => setField("appId", value)} />
            <Field label="Country" value={form.country} onChange={(value) => setField("country", value)} placeholder="US" />
            <label className="block text-sm font-semibold text-slate-700">
              Linked Agent
              <select className="mt-1" value={form.linkedAgentId} onChange={(event) => setField("linkedAgentId", event.target.value)}>
                <option value="">Select linked agent</option>
                {agents.map((agent) => (
                  <option key={agent._id} value={agent._id}>{agent.agentName || agent.name}</option>
                ))}
              </select>
            </label>
            <Toggle label="Inbound Enabled" checked={form.inboundEnabled} onChange={(value) => setField("inboundEnabled", value)} />
            <Toggle label="Outbound Enabled" checked={form.outboundEnabled} onChange={(value) => setField("outboundEnabled", value)} />
            <div className="md:col-span-2">
              <div className="mb-2 text-sm font-semibold text-slate-700">Inbound Call Mode</div>
              <div className="grid gap-2 md:grid-cols-3">
                <RadioTile
                  label="Dograh AI Agent"
                  checked={form.inboundMode === "dograh_ai"}
                  onChange={() => setField("inboundMode", "dograh_ai")}
                />
                <RadioTile
                  label="Static Greeting Only"
                  checked={form.inboundMode === "static_greeting"}
                  onChange={() => setField("inboundMode", "static_greeting")}
                />
                <RadioTile
                  label="Disabled"
                  checked={form.inboundMode === "disabled"}
                  onChange={() => setField("inboundMode", "disabled")}
                />
              </div>
            </div>
            {form.inboundMode === "dograh_ai" && (
              <div className="md:col-span-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-2">
                <InfoLine label="Dograh workflow" ok={Boolean(form.dograhWorkflowId || form.dograhWorkflowUuid)} value={form.dograhWorkflowUuid || form.dograhWorkflowId || "Not connected"} />
                <InfoLine label="Inbound routing" ok={["verified", "dograh_managed"].includes(form.inboundRoutingStatus)} value={form.inboundRoutingStatus || "Not verified"} />
                <InfoLine label="Phone number" ok={Boolean(form.phoneNumber)} value={form.phoneNumber || "Not assigned"} />
                <InfoLine label="Runtime" ok={form.inboundRoutingStatus === "verified" || form.inboundRoutingStatus === "dograh_managed"} value={form.inboundRoutingStatus === "failed" ? "Needs attention" : "Ready after verification"} />
              </div>
            )}
            <label className="block text-sm font-semibold text-slate-700">
              Status
              <select className="mt-1" value={form.status} onChange={(event) => setField("status", event.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div className="md:col-span-2">
              <Field label="Generated Webhook URL" value={form.webhookUrl || "Generated by backend after saving"} onChange={() => {}} readOnly />
            </div>
          </div>

          <div className="mt-5 action-row">
            <button className="btn-primary" disabled={busy === "save"} onClick={saveConfig}><Save size={16} />{busy === "save" ? "Saving..." : form._id ? "Save" : "Add Configuration"}</button>
            <button className="btn-secondary" disabled={!form._id || busy === "test"} onClick={() => testConfig()}><Wifi size={16} />{busy === "test" ? "Testing..." : "Test Connection"}</button>
            <button className="btn-secondary" disabled={!form._id || busy === "webhook"} onClick={() => configureWebhook()}><PlugZap size={16} />{busy === "webhook" ? "Configuring..." : "Configure Webhook"}</button>
            <button className="btn-secondary" disabled={!form._id || busy === "verifyInbound"} onClick={() => verifyInboundRouting()}><CheckCircle2 size={16} />{busy === "verifyInbound" ? "Verifying..." : "Verify Inbound Routing"}</button>
          </div>
        </section>

        <section className="card">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="panel-title">Saved Configurations</h2>
              <p className="muted">Saved secrets are masked after storage.</p>
            </div>
            <CheckCircle2 size={20} className="text-emerald-600" />
          </div>

          {!configs.length ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No telephony configurations yet.
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => (
                <div key={config._id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <button className="min-w-0 text-left" onClick={() => editConfig(config)}>
                      <h3 className="break-anywhere font-bold text-slate-950">{config.name}</h3>
                      <p className="break-anywhere text-sm text-slate-500">{config.provider} - {config.phoneNumber}</p>
                      <p className="break-anywhere text-xs text-slate-500">Inbound: {config.inboundMode === "dograh_ai" ? "Dograh AI Agent" : config.inboundMode === "static_greeting" ? "Static Greeting Only" : "Disabled"} - {config.inboundRoutingStatus || "not configured"}</p>
                      {config.dograhTelephonyConfigId && <p className="break-anywhere text-xs text-slate-400">Dograh config ID: {config.dograhTelephonyConfigId}</p>}
                      <p className="break-anywhere text-xs text-slate-400">{config.webhookUrl || "Webhook URL will be generated by backend"}</p>
                    </button>
                    <StatusBadge status={config.status} />
                  </div>
                  <div className="mt-4 action-row">
                    <button className="btn-secondary" onClick={() => editConfig(config)}>Edit</button>
                    <button className="btn-secondary" onClick={() => testConfig(config._id)}><Wifi size={16} />Test</button>
                    <button className="btn-secondary" onClick={() => configureWebhook(config._id)}><PlugZap size={16} />Webhook</button>
                    <button className="btn-secondary" onClick={() => verifyInboundRouting(config._id)}><CheckCircle2 size={16} />Verify Inbound</button>
                    <button className="btn-secondary text-rose-600" onClick={() => deleteConfig(config._id)}><Trash2 size={16} />Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "", readOnly = false }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-1 break-anywhere"
        type={type}
        value={value || ""}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      <input className="h-5 w-5" type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function RadioTile({ label, checked, onChange }) {
  return (
    <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${checked ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-700"}`}>
      <input className="h-4 w-4" type="radio" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function InfoLine({ label, value, ok }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={ok ? "break-anywhere font-semibold text-emerald-700" : "break-anywhere font-semibold text-amber-700"}>{value}</div>
    </div>
  );
}
