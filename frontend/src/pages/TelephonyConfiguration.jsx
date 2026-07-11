import {
  ArrowLeft,
  ChevronRight,
  Clipboard,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import PageLoader from "../components/PageLoader.jsx";
import { api } from "../lib/api.js";

const providers = [
  { value: "twilio", label: "Twilio", docs: "https://www.twilio.com/docs/voice" },
  { value: "exotel", label: "Exotel", docs: "https://developer.exotel.com/" },
  { value: "vonage", label: "Vonage", docs: "https://developer.vonage.com/en/voice/voice-api/overview" }
];

const emptyConfigForm = {
  name: "",
  provider: "twilio",
  isDefault: false,
  accountSid: "",
  authToken: "",
  phoneNumber: "",
  linkedAgentId: "",
  country: "US",
  inboundEnabled: true,
  inboundMode: "agent_runtime",
  outboundEnabled: true,
  status: "active"
};

const emptyPhoneForm = {
  phoneNumber: "",
  label: "",
  linkedAgentId: "",
  inboundEnabled: true,
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

function providerMeta(value) {
  return providers.find((provider) => provider.value === value) || providers[0];
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function configId(config) {
  return config?._id || config?.id || "";
}

function lastUpdated(config) {
  const value = config?.updatedAt || config?.updated_at || config?.createdAt;
  if (!value) return "Not updated yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not updated yet";
  return date.toLocaleString();
}

function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "Not configured";
  if (text.includes("*")) return text;
  return text.length <= 4 ? "****" : `${"*".repeat(Math.max(8, text.length - 4))}${text.slice(-4)}`;
}

function phoneRows(config, agents) {
  if (!config?.phoneNumber) return [];
  const linkedAgent = agents.find((agent) => agent._id === config.linkedAgentId);
  const workflowId = config.providerWorkflowId || linkedAgent?.providerWorkflowId;
  const workflowName = linkedAgent?.agentName || linkedAgent?.name;
  return [
    {
      id: config.phoneNumber,
      address: config.phoneNumber,
      type: "pstn",
      label: config.name || "Primary phone number",
      status: config.status || "active",
      inboundWorkflow: workflowId && workflowName ? `#${workflowId} ${workflowName}` : workflowName || "Not configured",
      isDefaultCaller: Boolean(config.outboundEnabled)
    }
  ];
}

function toastClass(type) {
  if (type === "error") return "border-red-500/30 bg-red-500/10 text-red-100";
  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
}

export default function TelephonyConfiguration() {
  const navigate = useNavigate();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { data: configsData, error: configsError, isFetching } = useQuery({
    queryKey: ["telephony"],
    queryFn: () => api("/telephony-configs")
  });
  const { data: agentsData } = useQuery({ queryKey: ["agents"], queryFn: () => api("/agents") });
  const configs = Array.isArray(configsData) ? configsData : [];
  const agents = Array.isArray(agentsData) ? agentsData : [];
  const loading = isFetching;
  const error = configsError ? formatApiError(configsError) : "";
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState("");
  const [configModal, setConfigModal] = useState(null);
  const [phoneModal, setPhoneModal] = useState(false);
  const [configForm, setConfigForm] = useState(emptyConfigForm);
  const [phoneForm, setPhoneForm] = useState(emptyPhoneForm);
  const [formErrors, setFormErrors] = useState({});

  const selectedConfig = useMemo(
    () => configs.find((config) => String(config._id || config.id) === String(id)),
    [configs, id]
  );

  function reloadTelephony() {
    return queryClient.invalidateQueries({ queryKey: ["telephony"] });
  }

  function showToast(message, type = "success") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3600);
  }

  function openAddModal() {
    setFormErrors({});
    setConfigForm(emptyConfigForm);
    setConfigModal("add");
  }

  function openEditModal(config) {
    setFormErrors({});
    setConfigForm({
      ...emptyConfigForm,
      ...config,
      isDefault: Boolean(config.outboundEnabled),
      accountSid: "",
      authToken: "",
      linkedAgentId: config.linkedAgentId || "",
      phoneNumber: config.phoneNumber || "",
      country: config.country || "US"
    });
    setConfigModal("edit");
  }

  function openPhoneModal(config) {
    setFormErrors({});
    setPhoneForm({
      ...emptyPhoneForm,
      phoneNumber: config.phoneNumber || "",
      label: config.name || "",
      linkedAgentId: config.linkedAgentId || "",
      inboundEnabled: config.inboundEnabled !== false,
      outboundEnabled: config.outboundEnabled !== false,
      status: config.status || "active"
    });
    setPhoneModal(true);
  }

  function validateConfigForm() {
    const nextErrors = {};
    if (!configForm.name.trim()) nextErrors.name = "Name is required.";
    if (!configForm.provider) nextErrors.provider = "Provider is required.";
    if (configModal === "add" && configForm.provider === "twilio" && !configForm.accountSid.trim()) nextErrors.accountSid = "Account SID is required for Twilio.";
    if (configModal === "add" && configForm.provider === "twilio" && !configForm.authToken.trim()) nextErrors.authToken = "Auth Token is required for Twilio.";
    if (configModal === "add" && !configForm.phoneNumber.trim()) nextErrors.phoneNumber = "A phone number is required by the current backend.";
    if (configModal === "add" && !configForm.linkedAgentId) nextErrors.linkedAgentId = "Select a linked agent.";
    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function saveConfig() {
    if (!validateConfigForm()) return;
    setBusy("config");
    try {
      const isEdit = configModal === "edit";
      const payload = {
        ...configForm,
        linkedAgentId: configForm.linkedAgentId || null,
        outboundEnabled: Boolean(configForm.isDefault || configForm.outboundEnabled)
      };
      if (isEdit && !payload.authToken) delete payload.authToken;
      if (isEdit && !payload.accountSid) delete payload.accountSid;
      const saved = await api(isEdit ? `/telephony-configs/${configForm._id}` : "/telephony-configs", {
        method: isEdit ? "PUT" : "POST",
        body: payload
      });
      setConfigForm(emptyConfigForm);
      setConfigModal(null);
      showToast(isEdit ? "Credentials updated." : "Telephony configuration created.");
      await reloadTelephony();
      navigate(`/telephony-configuration/${saved._id || saved.id}`);
    } catch (err) {
      showToast(formatApiError(err), "error");
    } finally {
      setBusy("");
    }
  }

  async function savePhoneNumber() {
    const nextErrors = {};
    if (!phoneForm.phoneNumber.trim()) nextErrors.phoneNumber = "Phone number is required.";
    if (!phoneForm.linkedAgentId) nextErrors.linkedAgentId = "Select an inbound workflow agent.";
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy("phone");
    try {
      await api(`/telephony-configs/${selectedConfig._id}`, {
        method: "PUT",
        body: {
          phoneNumber: phoneForm.phoneNumber,
          name: phoneForm.label || selectedConfig.name,
          linkedAgentId: phoneForm.linkedAgentId,
          inboundEnabled: phoneForm.inboundEnabled,
          outboundEnabled: phoneForm.outboundEnabled,
          status: phoneForm.status
        }
      });
      setPhoneModal(false);
      showToast("Phone number updated.");
      await reloadTelephony();
    } catch (err) {
      showToast(formatApiError(err), "error");
    } finally {
      setBusy("");
    }
  }

  async function deleteConfig(config) {
    if (!window.confirm("Delete this telephony configuration?")) return;
    setBusy(`delete-${config._id}`);
    try {
      await api(`/telephony-configs/${config._id}`, { method: "DELETE" });
      showToast("Telephony configuration deleted.");
      if (id) navigate("/telephony-configuration");
      await reloadTelephony();
    } catch (err) {
      showToast(formatApiError(err), "error");
    } finally {
      setBusy("");
    }
  }

  async function clearPhoneNumber() {
    if (!window.confirm("Deactivate this phone number?")) return;
    setBusy("phone-delete");
    try {
      await api(`/telephony-configs/${selectedConfig._id}`, {
        method: "PUT",
        body: { status: "inactive", inboundEnabled: false, outboundEnabled: false }
      });
      showToast("Phone number deactivated.");
      await reloadTelephony();
    } catch (err) {
      showToast(formatApiError(err), "error");
    } finally {
      setBusy("");
    }
  }

  async function copyText(value, label) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied.`);
    } catch {
      showToast("Copy failed. Select and copy the value manually.", "error");
    }
  }

  const page = (
    <div className="telephony-page">
      {toast && <div className={`telephony-toast ${toastClass(toast.type)}`}>{toast.message}</div>}
      {id ? (
        <DetailView
          config={selectedConfig}
          agents={agents}
          loading={loading}
          error={error}
          onRetry={reloadTelephony}
          onBack={() => navigate("/telephony-configuration")}
          onCopy={copyText}
          onEdit={openEditModal}
          onDelete={deleteConfig}
          onEditPhone={openPhoneModal}
          onDeletePhone={clearPhoneNumber}
          busy={busy}
        />
      ) : (
        <ListView
          configs={configs}
          loading={loading}
          error={error}
          onRetry={reloadTelephony}
          onAdd={openAddModal}
          onEdit={openEditModal}
          onDelete={deleteConfig}
          onCopy={copyText}
          busy={busy}
        />
      )}
      {configModal && (
        <ConfigModal
          mode={configModal}
          form={configForm}
          agents={agents}
          errors={formErrors}
          busy={busy === "config"}
          onChange={(name, value) => setConfigForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setConfigModal(null)}
          onSubmit={saveConfig}
        />
      )}
      {phoneModal && selectedConfig && (
        <PhoneModal
          form={phoneForm}
          agents={agents}
          errors={formErrors}
          busy={busy === "phone"}
          onChange={(name, value) => setPhoneForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setPhoneModal(false)}
          onSubmit={savePhoneNumber}
        />
      )}
    </div>
  );

  return page;
}

function ListView({ configs, loading, error, onRetry, onAdd, onEdit, onDelete, onCopy, busy }) {
  return (
    <>
      <PageHeader
        title="Telephony configurations"
        description={
          <>
            Connect one or more telephony provider accounts. Each campaign uses one configuration; inbound calls are routed to the right one by account ID.
          </>
        }
        action={<button className="btn-primary" onClick={onAdd}><Plus size={16} /> Add configuration</button>}
      />

      {loading && <LoadingBlock />}
      {!loading && error && <ErrorBlock message={error} onRetry={onRetry} />}
      {!loading && !error && !configs.length && <EmptyBlock onAdd={onAdd} />}
      {!loading && !error && Boolean(configs.length) && (
        <div className="telephony-list">
          {configs.map((config) => {
            const meta = providerMeta(config.provider);
            const phoneCount = config.phoneNumber ? 1 : 0;
            const id = configId(config);
            return (
              <article key={config._id || config.id} className="telephony-config-row">
                <Link className="telephony-row-main" to={`/telephony-configuration/${config._id || config.id}`}>
                  <div className="telephony-row-title">
                    <strong>{config.name || meta.label}</strong>
                    <Pill>{config.provider || "provider"}</Pill>
                    {config.outboundEnabled && <Pill tone="light">Default</Pill>}
                  </div>
                  <div className="telephony-row-meta">{phoneCount} {phoneCount === 1 ? "phone number" : "phone numbers"}</div>
                  <div className="telephony-row-id">
                    <span>Configuration ID: </span>
                    <code>{id || "Not configured"}</code>
                  </div>
                </Link>
                <button className="telephony-copy-inline" onClick={() => onCopy(id, "Configuration ID")} aria-label="Copy configuration ID">
                  <Clipboard size={14} />
                </button>
                <div className="telephony-row-actions">
                  <IconButton label="Edit credentials" onClick={() => onEdit(config)}><Pencil size={17} /></IconButton>
                  <IconButton danger label="Delete configuration" disabled={busy === `delete-${config._id}`} onClick={() => onDelete(config)}><Trash2 size={17} /></IconButton>
                  <Link className="telephony-icon-button" to={`/telephony-configuration/${config._id || config.id}`} aria-label="Open configuration">
                    <ChevronRight size={18} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function DetailView({ config, agents, loading, error, onRetry, onBack, onCopy, onEdit, onDelete, onEditPhone, onDeletePhone, busy }) {
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={onRetry} />;
  if (!config) return <ErrorBlock message="Telephony configuration not found." onRetry={onBack} retryLabel="All configurations" />;

  const meta = providerMeta(config.provider);
  const id = configId(config);
  const rows = phoneRows(config, agents);
  const webhookUrl = config.webhookUrl || config.twilioVoiceUrl || "Not configured";

  return (
    <>
      <button className="telephony-back-link" onClick={onBack}><ArrowLeft size={16} /> All configurations</button>

      <section className="telephony-detail-card">
        <div className="telephony-detail-top">
          <div className="min-w-0">
            <div className="telephony-row-title">
              <h1>{config.name || meta.label}</h1>
              <Pill>{config.provider}</Pill>
              {config.outboundEnabled && <Pill tone="light">Default</Pill>}
            </div>
            <p className="telephony-muted">Updated {lastUpdated(config)}</p>
            <button className="telephony-value-button" onClick={() => onCopy(id, "Configuration ID")}>
              Configuration ID: <code>{id || "Not configured"}</code> <Clipboard size={14} />
            </button>
          </div>
          <button className="btn-secondary" onClick={() => onEdit(config)}><Pencil size={16} /> Edit credentials</button>
        </div>

        <div className="telephony-secret-grid">
          <SecretValue label="account_sid" value={maskSecret(config.accountSid || config.account_sid_masked)} />
          <SecretValue label="auth_token" value={maskSecret(config.authToken || config.auth_token_masked)} />
        </div>

        <div className="telephony-webhook">
          <span>Inbound webhook URL</span>
          <button onClick={() => onCopy(webhookUrl, "Inbound webhook URL")}>
            <code>{webhookUrl}</code> {webhookUrl !== "Not configured" && <Clipboard size={14} />}
          </button>
        </div>
      </section>

      <section className="telephony-detail-card">
        <div className="telephony-section-header">
          <div className="min-w-0">
            <h2>Phone numbers</h2>
            <p>
              Numbers used as caller ID for outbound and accepted for inbound matching. SIP URIs and extensions are supported alongside PSTN numbers.
            </p>
          </div>
          <button className="btn-primary" onClick={() => onEditPhone(config)}><Plus size={16} /> Add phone number</button>
        </div>

        {!rows.length ? (
          <div className="telephony-empty-inline">No phone numbers</div>
        ) : (
          <div className="telephony-table-wrap">
            <table className="telephony-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Type</th>
                  <th>Label</th>
                  <th>Status</th>
                  <th>Inbound workflow</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="telephony-strong">{row.address}</td>
                    <td><Pill>{row.type}</Pill></td>
                    <td>{row.label}</td>
                    <td>
                      <div className="telephony-pills">
                        <Pill>{titleCase(row.status)}</Pill>
                        {row.isDefaultCaller && <Pill tone="light">Default caller</Pill>}
                      </div>
                    </td>
                    <td>{row.inboundWorkflow}</td>
                    <td>
                      <div className="telephony-table-actions">
                        <IconButton label="Edit phone number" onClick={() => onEditPhone(config)}><Pencil size={17} /></IconButton>
                        <IconButton danger label="Delete phone number" disabled={busy === "phone-delete"} onClick={onDeletePhone}><Trash2 size={17} /></IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="telephony-danger-row">
          <button className="btn-danger" disabled={busy === `delete-${config._id}`} onClick={() => onDelete(config)}>
            <Trash2 size={16} /> Delete configuration
          </button>
        </div>
      </section>
    </>
  );
}

function ConfigModal({ mode, form, agents, errors, busy, onChange, onClose, onSubmit }) {
  const meta = providerMeta(form.provider);
  const isEdit = mode === "edit";
  return (
    <Modal onClose={onClose}>
      <div className="telephony-modal-header">
        <div>
          <h2>{isEdit ? "Edit telephony credentials" : "Add telephony configuration"}</h2>
          <p>Connect a telephony provider account. Phone numbers are added after the configuration is created.</p>
        </div>
        <button onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>

      <div className="telephony-modal-body">
        <TextField label="Name" placeholder="e.g. Twilio US prod" value={form.name} error={errors.name} onChange={(value) => onChange("name", value)} />
        <FieldGroup label="Provider" error={errors.provider}>
          <select value={form.provider} onChange={(event) => onChange("provider", event.target.value)}>
            {providers.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
          </select>
        </FieldGroup>
        <a className="telephony-doc-link" href={meta.docs} target="_blank" rel="noreferrer">{meta.label} docs <ExternalLink size={12} /></a>

        <label className="telephony-toggle-card">
          <span>
            <strong>Set as default for outbound calls</strong>
            <small>Used by test calls and campaigns when no specific config is selected.</small>
          </span>
          <input type="checkbox" checked={Boolean(form.isDefault)} onChange={(event) => onChange("isDefault", event.target.checked)} />
        </label>

        <div className="telephony-divider" />
        <TextField label="Account SID" value={form.accountSid} help={`${meta.label} Account SID${form.provider === "twilio" ? " (starts with AC)" : ""}${isEdit ? " (leave blank to keep current SID)" : ""}`} error={errors.accountSid} onChange={(value) => onChange("accountSid", value)} />
        <TextField label="Auth Token" type="password" value={form.authToken} help={`${meta.label} Auth Token${isEdit ? " (leave blank to keep current token)" : ""}`} error={errors.authToken} onChange={(value) => onChange("authToken", value)} />

        {!isEdit && (
          <>
            <div className="telephony-phone-note">
              <strong>Phone Numbers</strong>
              <p>Phone numbers are managed separately on the configuration page.</p>
              <p>E.164-formatted {meta.label} phone numbers used for outbound calls</p>
            </div>
            <TextField label="First phone number" placeholder="+17578297060" value={form.phoneNumber} error={errors.phoneNumber} onChange={(value) => onChange("phoneNumber", value)} />
            <FieldGroup label="Linked agent" error={errors.linkedAgentId}>
              <select value={form.linkedAgentId} onChange={(event) => onChange("linkedAgentId", event.target.value)}>
                <option value="">Select linked agent</option>
                {agents.map((agent) => <option key={agent._id} value={agent._id}>{agent.agentName || agent.name}</option>)}
              </select>
            </FieldGroup>
          </>
        )}
      </div>

      <div className="telephony-modal-footer">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={onSubmit}>
          {busy ? <RefreshCw className="animate-spin" size={16} /> : null}
          {isEdit ? "Save" : "Create"}
        </button>
      </div>
    </Modal>
  );
}

function PhoneModal({ form, agents, errors, busy, onChange, onClose, onSubmit }) {
  return (
    <Modal onClose={onClose}>
      <div className="telephony-modal-header">
        <div>
          <h2>Add phone number</h2>
          <p>Manage the provider number used for outbound caller ID and inbound matching.</p>
        </div>
        <button onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="telephony-modal-body">
        <TextField label="Address" placeholder="+17578297060" value={form.phoneNumber} error={errors.phoneNumber} onChange={(value) => onChange("phoneNumber", value)} />
        <TextField label="Label" placeholder="Hospital Reception Number" value={form.label} onChange={(value) => onChange("label", value)} />
        <FieldGroup label="Inbound workflow" error={errors.linkedAgentId}>
          <select value={form.linkedAgentId} onChange={(event) => onChange("linkedAgentId", event.target.value)}>
            <option value="">Select linked agent</option>
            {agents.map((agent) => <option key={agent._id} value={agent._id}>{agent.agentName || agent.name}</option>)}
          </select>
        </FieldGroup>
        <label className="telephony-toggle-card">
          <span><strong>Inbound active</strong><small>Accept calls to this number.</small></span>
          <input type="checkbox" checked={Boolean(form.inboundEnabled)} onChange={(event) => onChange("inboundEnabled", event.target.checked)} />
        </label>
        <label className="telephony-toggle-card">
          <span><strong>Default caller</strong><small>Use this number for outbound calls.</small></span>
          <input type="checkbox" checked={Boolean(form.outboundEnabled)} onChange={(event) => onChange("outboundEnabled", event.target.checked)} />
        </label>
      </div>
      <div className="telephony-modal-footer">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={onSubmit}>
          {busy ? <RefreshCw className="animate-spin" size={16} /> : null}
          Save
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="telephony-modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel telephony-modal-panel" onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, error, help, type = "text", placeholder = "" }) {
  return (
    <FieldGroup label={label} error={error} help={help}>
      <input type={type} value={value || ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </FieldGroup>
  );
}

function FieldGroup({ label, error, help, children }) {
  return (
    <label className="field-label">
      <span>{label}</span>
      {children}
      {help && <small className="mt-1 text-xs font-medium leading-5 text-neutral-500">{help}</small>}
      {error && <em className="mt-1 text-xs font-medium leading-5 text-rose-600 not-italic">{error}</em>}
    </label>
  );
}

function SecretValue({ label, value }) {
  return (
    <div className="telephony-secret">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function Pill({ children, tone = "dark" }) {
  return <span className={`telephony-pill telephony-pill-${tone}`}>{children}</span>;
}

function IconButton({ children, label, danger = false, ...props }) {
  return (
    <button className={`telephony-icon-button ${danger ? "telephony-icon-danger" : ""}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

function LoadingBlock() {
  return <PageLoader label="Loading telephony configuration" />;
}

function ErrorBlock({ message, onRetry, retryLabel = "Retry" }) {
  return (
    <div className="telephony-state-card">
      <h2>Unable to load telephony configurations</h2>
      <p>{message}</p>
      <button className="btn-secondary" onClick={onRetry}><RefreshCw size={16} /> {retryLabel}</button>
    </div>
  );
}

function EmptyBlock({ onAdd }) {
  return (
    <div className="telephony-state-card">
      <h2>No telephony configurations yet</h2>
      <p>Add your first provider account to start connecting phone numbers.</p>
      <button className="btn-primary" onClick={onAdd}><Plus size={16} /> Add configuration</button>
    </div>
  );
}
