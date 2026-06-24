import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw, Server, ShieldCheck, Trash2, Workflow } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const defaultForm = { apiKey: "", baseUrl: "", allowPlatformFallback: false };

function fmt(value) {
  return value ? new Date(value).toLocaleString() : "Not validated";
}

export default function DograhSettings() {
  const [data, setData] = useState(null);
  const [conn, setConn] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const apiKeyRef = useRef(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError("");
    try {
      const [result, connection] = await Promise.all([
        api("/integrations/dograh"),
        api("/connections/dograh").catch(() => null)
      ]);
      setData(result);
      setConn(connection);
      setForm((current) => ({
        ...current,
        baseUrl: result.userDograh?.baseUrl || current.baseUrl,
        allowPlatformFallback: Boolean(result.userDograh?.allowPlatformFallback)
      }));
    } catch (err) {
      setError(err.response?.message || err.message);
    }
  }

  async function savePreferences(patch) {
    // Optimistic update so the toggles feel instant.
    setConn((current) => ({ ...(current || {}), ...patch }));
    setPrefsSaving(true);
    setError("");
    try {
      const updated = await api("/connections/dograh/preferences", { method: "PATCH", body: patch });
      setConn(updated);
    } catch (err) {
      setError(err.response?.message || err.message);
      await load();
    } finally {
      setPrefsSaving(false);
    }
  }

  function focusApiKey() {
    apiKeyRef.current?.focus();
    apiKeyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveDograh() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await api("/integrations/dograh/connect", {
        method: "POST",
        body: { apiKey: form.apiKey, baseUrl: form.baseUrl }
      });
      setForm((current) => ({ ...current, apiKey: "" }));
      setMessage("My Dograh connected and verified.");
      await load();
    } catch (err) {
      setError(err.response?.message || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function testDograh() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const id = data?.userDograh?.id;
      const path = id ? `/integrations/dograh/${id}/test` : "/integrations/dograh/test";
      await api(path, { method: "POST", body: form });
      setMessage("Dograh connection test passed.");
      await load();
    } catch (err) {
      setError(err.response?.message || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateFallback(value) {
    setForm((current) => ({ ...current, allowPlatformFallback: value }));
    const id = data?.userDograh?.id;
    if (!id) return;
    try {
      await api(`/integrations/dograh/${id}/fallback`, { method: "PUT", body: { allowPlatformFallback: value } });
      await load();
    } catch (err) {
      setError(err.response?.message || err.message);
    }
  }

  async function disconnectDograh() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const id = data?.userDograh?.id;
      await api(id ? `/integrations/dograh/${id}` : "/integrations/dograh/disconnect", { method: "DELETE" });
      setMessage("My Dograh disconnected.");
      await load();
    } catch (err) {
      const affected = err.response?.details?.affectedAgents || err.response?.affectedAgents || [];
      const suffix = affected.length ? ` Affected agents: ${affected.map((agent) => agent.name).join(", ")}.` : "";
      setError(`${err.response?.message || err.message}${suffix}`);
    } finally {
      setSaving(false);
    }
  }

  const platform = data?.platform || {};
  const userDograh = data?.userDograh || {};

  return (
    <div className="page-stack">
      <PageHeader title="Dograh" description="Manage the Dograh runtime account used for workflows, calling, web calling, and provider synchronization." />
      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {message && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

      <div className="grid min-w-0 gap-5 xl:grid-cols-3 xl:gap-6">
        <section className="card xl:col-span-2">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="panel-title">My Dograh</h2>
            <StatusBadge status={userDograh.status || "disconnected"} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Info icon={KeyRound} label="Connection Name" value={userDograh.connectionName || "My Dograh"} />
            <Info icon={Server} label="Deployment Type" value={userDograh.deploymentType || "cloud"} />
            <Info icon={Workflow} label="Base URL" value={userDograh.baseUrl || "Not connected"} />
            <Info icon={ShieldCheck} label="API Key" value={userDograh.maskedApiKey || "Not connected"} />
            <Info icon={CheckCircle2} label="Runtime Status" value={userDograh.runtimeStatus || "configuration_required"} />
            <Info icon={RefreshCw} label="Last Validated" value={fmt(userDograh.lastValidatedAt || userDograh.lastTestedAt)} />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <input
              ref={apiKeyRef}
              type="password"
              placeholder={userDograh.maskedApiKey ? "Enter new API key to replace" : "Dograh API key"}
              value={form.apiKey}
              onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
            />
            <input
              placeholder="https://app.dograh.com/api/v1"
              value={form.baseUrl}
              onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
            />
          </div>

          <label className="mt-4 flex items-start gap-3 rounded-xl border border-hairline p-3 text-sm text-neutral-700">
            <input className="mt-1 h-4 w-4" type="checkbox" checked={form.allowPlatformFallback} onChange={(event) => updateFallback(event.target.checked)} />
            <span>
              <span className="block font-semibold text-ink">Allow Platform Dograh Fallback</span>
              Platform Dograh may be used only while creating a new agent if My Dograh is unavailable. Existing agents never switch automatically.
            </span>
          </label>

          <KeyPreferences conn={conn} saving={prefsSaving} onChange={savePreferences} onReconnect={focusApiKey} />

          <div className="mt-5 action-row">
            <button className="btn-primary" disabled={saving || (!form.apiKey && !userDograh.connected)} onClick={saveDograh}><KeyRound size={16} />Save & Connect</button>
            <button className="btn-secondary" disabled={saving || (!form.apiKey && !userDograh.connected)} onClick={testDograh}><RefreshCw size={16} />Test Connection</button>
            <button className="btn-danger" disabled={saving || !userDograh.connected} onClick={disconnectDograh}><Trash2 size={16} />Disconnect</button>
          </div>

          {userDograh.lastErrorSafeMessage && (
            <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{userDograh.lastErrorSafeMessage}</p>
          )}
        </section>

        <aside className="card">
          <h2 className="panel-title">Platform Dograh</h2>
          <div className="mt-4 space-y-3">
            <Info icon={CheckCircle2} label="Status" value={platform.status || "unavailable"} />
            <Info icon={Server} label="Base URL" value={platform.baseUrl || "Not configured"} />
            <Info icon={ShieldCheck} label="API Key" value={platform.maskedApiKey || "Not configured"} />
          </div>
          <p className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">Platform managed. No user API key is required.</p>
        </aside>

        <section className="card xl:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="panel-title">Agents Using Dograh</h2>
            <button className="btn-secondary" onClick={load}><RefreshCw size={16} />Refresh</button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <AgentList title="Platform Dograh" agents={platform.agentsUsingConnection || []} />
            <AgentList title="My Dograh" agents={userDograh.agentsUsingConnection || []} />
          </div>
        </section>
      </div>
    </div>
  );
}

function AgentList({ title, agents }) {
  return (
    <div className="rounded-xl border border-hairline p-4">
      <h3 className="font-semibold text-ink">{title}</h3>
      <div className="mt-3 space-y-2">
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-lg bg-neutral-50 p-3 text-sm">
            <p className="font-semibold text-ink">{agent.name}</p>
            <p className="break-anywhere text-neutral-500">{agent.workflowId || "No workflow"} · {agent.syncStatus || "not synced"}</p>
          </div>
        ))}
        {!agents.length && <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-500">No agents use this connection.</p>}
      </div>
    </div>
  );
}

function KeyPreferences({ conn, saving, onChange, onReconnect }) {
  const hasValidatedKey = Boolean(conn?.hasValidatedKey);
  const preferOwnKey = Boolean(conn?.preferOwnKey);
  const fallbackOnFailure = Boolean(conn?.fallbackOnFailure);
  const deactivated = Boolean(conn) && conn.isActive === false;
  const disabledHint = hasValidatedKey ? undefined : "Connect and validate a Dograh API key first.";

  return (
    <div className="mt-4 space-y-3">
      {deactivated && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <p>
              Your Dograh key appears to be failing (last error: {conn?.lastFailureReason || "unknown"}). Reconnect or
              fix your key to resume bring-your-own-key calls.
            </p>
          </div>
          <button className="btn-secondary shrink-0" onClick={onReconnect}>Reconnect</button>
        </div>
      )}

      <Toggle
        label="Use my own Dograh key first"
        help="When enabled, your own API key is used even if you still have platform credits remaining."
        checked={preferOwnKey}
        disabled={!hasValidatedKey || saving}
        title={disabledHint}
        onChange={(value) => onChange({ preferOwnKey: value })}
      />

      {preferOwnKey && (
        <Toggle
          label="Fall back to platform credits if my key fails"
          help="If disabled (default), a failed call will show an error instead of using your credits."
          checked={fallbackOnFailure}
          disabled={!hasValidatedKey || saving}
          title={disabledHint}
          onChange={(value) => onChange({ fallbackOnFailure: value })}
        />
      )}
    </div>
  );
}

function Toggle({ label, help, checked, disabled, title, onChange }) {
  return (
    <label
      title={title}
      className={`flex items-start gap-3 rounded-xl border border-hairline p-3 text-sm text-neutral-700 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <input
        className="mt-1 h-4 w-4"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block font-semibold text-ink">{label}</span>
        {help}
      </span>
    </label>
  );
}

function Info({ icon: Icon = AlertTriangle, label, value }) {
  return (
    <div className="rounded-xl border border-hairline p-3">
      <div className="mb-2 flex items-center gap-2 text-neutral-500"><Icon size={16} /><span className="text-xs font-semibold uppercase">{label}</span></div>
      <p className="break-anywhere text-sm font-semibold text-ink">{value || "-"}</p>
    </div>
  );
}
