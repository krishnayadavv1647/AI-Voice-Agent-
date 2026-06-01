import { CheckCircle2, PhoneCall, PlugZap, Save, Trash2, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

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
  status: "active"
};

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
  const generatedWebhookUrl = form.webhookUrl || `${API_URL}/telephony/${form.provider}/incoming`;

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

    if (!form.name || !form.phoneNumber) {
      setError("Configuration name and phone number are required.");
      return;
    }

    setBusy("save");
    try {
      const path = form._id ? `/telephony-configs/${form._id}` : "/telephony-configs";
      const method = form._id ? "PUT" : "POST";
      const saved = await api(path, { method, body: { ...form, webhookUrl: generatedWebhookUrl } });
      setForm({ ...emptyForm, ...saved, linkedAgentId: saved.linkedAgentId || "" });
      setMessage(`${providerLabel} configuration saved.`);
      await load();
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
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
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
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
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
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
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
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

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="card">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
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
                <option value="">No linked agent</option>
                {agents.map((agent) => (
                  <option key={agent._id} value={agent._id}>{agent.agentName || agent.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Status
              <select className="mt-1" value={form.status} onChange={(event) => setField("status", event.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div className="md:col-span-2">
              <Field label="Generated Webhook URL" value={generatedWebhookUrl} onChange={(value) => setField("webhookUrl", value)} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy === "save"} onClick={saveConfig}><Save size={16} />{busy === "save" ? "Saving..." : "Save"}</button>
            <button className="btn-secondary" disabled={!form._id || busy === "test"} onClick={() => testConfig()}><Wifi size={16} />{busy === "test" ? "Testing..." : "Test Connection"}</button>
            <button className="btn-secondary" disabled={!form._id || busy === "webhook"} onClick={() => configureWebhook()}><PlugZap size={16} />{busy === "webhook" ? "Configuring..." : "Configure Webhook"}</button>
          </div>
        </section>

        <section className="card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
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
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => editConfig(config)}>
                      <h3 className="break-anywhere font-bold text-slate-950">{config.name}</h3>
                      <p className="break-anywhere text-sm text-slate-500">{config.provider} - {config.phoneNumber}</p>
                      <p className="break-anywhere text-xs text-slate-400">{config.webhookUrl || `${API_URL}/telephony/${config.provider}/incoming`}</p>
                    </button>
                    <StatusBadge status={config.status} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="btn-secondary" onClick={() => editConfig(config)}>Edit</button>
                    <button className="btn-secondary" onClick={() => testConfig(config._id)}><Wifi size={16} />Test</button>
                    <button className="btn-secondary" onClick={() => configureWebhook(config._id)}><PlugZap size={16} />Webhook</button>
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

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input className="mt-1" type={type} value={value || ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
