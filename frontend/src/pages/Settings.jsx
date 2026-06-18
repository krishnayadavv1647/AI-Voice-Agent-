import { Bell, CreditCard, KeyRound, Lock, MessageCircle, PhoneCall, Save, Send, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import Section from "../components/Section.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../state/AuthContext.jsx";

export default function Settings() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState({ leads: true, calls: true, weekly: false, failures: true });
  const [telephonyConfigs, setTelephonyConfigs] = useState([]);
  const [telegram, setTelegram] = useState(null);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramMessage, setTelegramMessage] = useState("");
  const [agents, setAgents] = useState([]);
  const [telephonyForm, setTelephonyForm] = useState({
    name: "",
    provider: "twilio",
    phoneNumber: "",
    accountSid: "",
    authToken: "",
    apiKey: "",
    apiSecret: "",
    appId: "",
    linkedAgentId: "",
    inboundEnabled: true,
    outboundEnabled: true,
    webhookUrl: ""
  });
  const [telephonyMessage, setTelephonyMessage] = useState("");

  useEffect(() => {
    loadTelephonyConfigs();
    loadTelegramStatus();
  }, []);

  async function loadTelegramStatus() {
    try {
      setTelegram(await api("/integrations/telegram/status"));
    } catch (error) {
      setTelegramMessage(error.message);
    }
  }

  async function generateTelegramCode() {
    setTelegramMessage("");
    try {
      const result = await api("/integrations/telegram/connect-code", { method: "POST" });
      setTelegram(result);
      setTelegramCode(result.connectCode || "");
      setTelegramMessage("Connect code generated.");
    } catch (error) {
      setTelegramMessage(error.response?.message || error.message);
    }
  }

  async function disconnectTelegram() {
    setTelegramMessage("");
    try {
      await api("/integrations/telegram/disconnect", { method: "DELETE" });
      setTelegramCode("");
      setTelegram({ status: "revoked" });
      setTelegramMessage("Telegram disconnected.");
    } catch (error) {
      setTelegramMessage(error.response?.message || error.message);
    }
  }

  async function updateTelegramSetting(field, value) {
    const next = { ...(telegram || {}), [field]: value };
    setTelegram(next);
    try {
      setTelegram(await api("/integrations/telegram/settings", { method: "PATCH", body: { [field]: value } }));
    } catch (error) {
      setTelegramMessage(error.response?.message || error.message);
    }
  }

  async function loadTelephonyConfigs() {
    try {
      const [configs, agentList] = await Promise.all([api("/telephony-configs"), api("/agents")]);
      setTelephonyConfigs(configs);
      setAgents(agentList);
    } catch (error) {
      setTelephonyMessage(error.message);
    }
  }

  async function saveTelephonyConfig() {
    setTelephonyMessage("");
    if (!telephonyForm.linkedAgentId) {
      setTelephonyMessage("Select a linked agent before adding a Dograh telephony configuration.");
      return;
    }
    try {
      await api("/telephony-configs", { method: "POST", body: telephonyForm });
      setTelephonyForm({ ...telephonyForm, name: "", phoneNumber: "", accountSid: "", authToken: "", apiKey: "", apiSecret: "", appId: "", linkedAgentId: "", webhookUrl: "" });
      setTelephonyMessage("Telephony config saved.");
      await loadTelephonyConfigs();
    } catch (error) {
      setTelephonyMessage(error.response?.userMessage || error.response?.message || error.message);
    }
  }

  async function testTelephonyConfig(id) {
    setTelephonyMessage("");
    try {
      const result = await api(`/telephony-configs/${id}/test`, { method: "POST", body: {} });
      setTelephonyMessage(result.result?.message || "Telephony config test completed.");
    } catch (error) {
      setTelephonyMessage(error.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader title="Settings" description="Manage account preferences, notifications, team controls, and supporting integrations." />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="self-start rounded-xl border border-slate-200 bg-white p-3 lg:sticky lg:top-24">
          {["General", "Notifications", "Messaging", "Telephony", "Team"].map((item) => (
            <a key={item} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950" href={`#${item.toLowerCase()}`}>{item}</a>
          ))}
          <div className="my-2 border-t border-slate-100" />
          <Link className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950" to="/dograh-settings">Dograh</Link>
          <Link className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950" to="/integrations/llm-providers">LLM Providers</Link>
          <Link className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950" to="/integrations/voice-providers">Voice Providers</Link>
        </aside>

        <div className="min-w-0 space-y-8">
          <Section className="scroll-mt-24" title="General" description="Profile, access, billing, and API visibility.">
            <div id="general" className="grid min-w-0 gap-6 xl:grid-cols-2">
              <Panel icon={Users} title="Profile" description="Read-only account identity for this workspace.">
                <label className="field-label">Profile name<input value={user?.name || ""} readOnly /></label>
                <label className="field-label">Email<input value={user?.email || ""} readOnly /></label>
                <button className="btn-secondary" onClick={() => alert("Profile editing can be connected next.")}><Save size={16} />Save Changes</button>
              </Panel>

              <Panel icon={Lock} title="Security" description="Password settings for the current account.">
                <input type="password" aria-label="Current password" placeholder="Current password" />
                <input type="password" aria-label="New password" placeholder="New password" />
                <button className="btn-secondary" onClick={() => alert("Password change endpoint can be connected next.")}>Update Password</button>
              </Panel>

              <Panel icon={KeyRound} title="API Keys" description="Credentials are managed in dedicated integration pages. Full keys are never exposed in the browser.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link className="btn-secondary" to="/dograh-settings">Manage Dograh</Link>
                  <Link className="btn-secondary" to="/integrations/llm-providers">Manage LLM Providers</Link>
                </div>
              </Panel>

              <Panel icon={CreditCard} title="Billing & Usage Limits" description="Plan details and limits for the workspace.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="Plan" value={user?.plan || "Free"} />
                  <Info label="Minutes limit" value="Placeholder" />
                </div>
              </Panel>
            </div>
          </Section>

          <Section className="scroll-mt-24" title="Notifications" description="Choose which operational events should notify your team.">
            <Panel icon={Bell} title="Notification Preferences">
              <div id="notifications" className="grid gap-3 sm:grid-cols-2">
                {Object.entries(notifications).map(([key, value]) => (
                  <label key={key} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm font-medium capitalize">
                    {key}
                    <input className="h-5 w-5" type="checkbox" checked={value} onChange={(event) => setNotifications({ ...notifications, [key]: event.target.checked })} />
                  </label>
                ))}
              </div>
            </Panel>
          </Section>

          <Section className="scroll-mt-24" title="Messaging" description="Connect Telegram for operational alerts and summaries.">
            <Panel icon={MessageCircle} title="Telegram Integration" description="Generate a code, connect the bot, and control alert types.">
              <div id="messaging" className="grid gap-3 sm:grid-cols-2">
                <Info label="Status" value={telegram?.status || "Not connected"} />
                <Info label="Bot" value={telegram?.botUsername || "Configure TELEGRAM_BOT_USERNAME"} />
                <Info label="Telegram User" value={telegram?.telegramUsername || "Not connected"} />
                <Info label="Connected At" value={telegram?.connectedAt ? new Date(telegram.connectedAt).toLocaleString() : "Not connected"} />
              </div>

              {telegram?.botLink && <a className="btn-secondary" href={telegram.botLink} target="_blank" rel="noreferrer"><Send size={16} />Open Telegram Bot</a>}

              {telegramCode && (
                <div className="rounded-xl bg-brand-50 p-4">
                  <p className="text-xs font-semibold uppercase text-brand-700">Connect Code</p>
                  <p className="mt-1 text-2xl font-semibold tracking-wide text-brand-700">{telegramCode}</p>
                  <p className="mt-1 break-anywhere text-sm text-slate-600">Send: /connect {telegramCode}</p>
                </div>
              )}

              <div className="action-row">
                <button className="btn-primary" onClick={generateTelegramCode}><MessageCircle size={16} />Generate Connect Code</button>
                <button className="btn-secondary" onClick={loadTelegramStatus}><RefreshIcon />Refresh Status</button>
                <button className="btn-danger" disabled={telegram?.status !== "connected"} onClick={disconnectTelegram}>Disconnect</button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["dailySummaryEnabled", "Daily summary"],
                  ["appointmentBookedEnabled", "Appointments booked"],
                  ["hotLeadEnabled", "Hot leads"],
                  ["callFailedEnabled", "Failed calls"]
                ].map(([field, label]) => (
                  <label key={field} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm font-medium">
                    {label}
                    <input className="h-5 w-5" type="checkbox" disabled={telegram?.status !== "connected"} checked={Boolean(telegram?.[field])} onChange={(event) => updateTelegramSetting(field, event.target.checked)} />
                  </label>
                ))}
              </div>
              {telegramMessage && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{telegramMessage}</p>}
            </Panel>
          </Section>

          <Section className="scroll-mt-24" title="Telephony" description="Add calling providers and link numbers to agents.">
            <Panel icon={PhoneCall} title="Telephony Settings" description="Add Twilio, Exotel, or Vonage numbers. Secret values are masked after saving.">
              <div id="telephony" className="field-grid">
                <input placeholder="Config name" value={telephonyForm.name} onChange={(event) => setTelephonyForm({ ...telephonyForm, name: event.target.value })} />
                <select value={telephonyForm.provider} onChange={(event) => setTelephonyForm({ ...telephonyForm, provider: event.target.value })}>
                  <option value="twilio">Twilio</option>
                  <option value="exotel">Exotel</option>
                  <option value="vonage">Vonage</option>
                </select>
                <input placeholder="Phone number" value={telephonyForm.phoneNumber} onChange={(event) => setTelephonyForm({ ...telephonyForm, phoneNumber: event.target.value })} />
                <input placeholder="Account SID / API key" value={telephonyForm.accountSid} onChange={(event) => setTelephonyForm({ ...telephonyForm, accountSid: event.target.value, apiKey: event.target.value })} />
                <input placeholder="Auth token / API secret" type="password" value={telephonyForm.authToken} onChange={(event) => setTelephonyForm({ ...telephonyForm, authToken: event.target.value, apiSecret: event.target.value })} />
                <select value={telephonyForm.linkedAgentId} onChange={(event) => setTelephonyForm({ ...telephonyForm, linkedAgentId: event.target.value })}>
                  <option value="">Select linked agent</option>
                  {agents.map((agent) => <option key={agent._id} value={agent._id}>{agent.agentName || agent.name}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input className="h-4 w-4" type="checkbox" checked={telephonyForm.inboundEnabled} onChange={(event) => setTelephonyForm({ ...telephonyForm, inboundEnabled: event.target.checked })} />Inbound enabled</label>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input className="h-4 w-4" type="checkbox" checked={telephonyForm.outboundEnabled} onChange={(event) => setTelephonyForm({ ...telephonyForm, outboundEnabled: event.target.checked })} />Outbound enabled</label>
              </div>
              <button className="btn-primary" onClick={saveTelephonyConfig}>Add Configuration</button>
              {telephonyMessage && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{telephonyMessage}</p>}
              <div className="space-y-3">
                {telephonyConfigs.map((config) => (
                  <div key={config._id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950">{config.name}</p>
                        <p className="break-anywhere text-sm text-slate-500">{config.provider} - {config.phoneNumber}</p>
                      </div>
                      <button className="btn-secondary" onClick={() => testTelephonyConfig(config._id)}>Test Connection</button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </Section>

          <Section className="scroll-mt-24" title="Team" description="Role and member controls for future collaboration workflows.">
            <Panel icon={ShieldCheck} title="Team">
              <div id="team">
                <p className="text-sm leading-6 text-slate-500">Team access and role controls are reserved for the next plan level.</p>
                <button className="btn-secondary mt-4" disabled>Invite Member</button>
              </div>
            </Panel>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Panel({ icon: Icon, title, description, children }) {
  return (
    <section className="card space-y-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="icon-tile"><Icon size={18} /></div>
        <div className="min-w-0">
          <h2 className="panel-title min-w-0 break-anywhere">{title}</h2>
          {description && <p className="mt-1 text-[13px] leading-5 text-slate-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Info({ label, value }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="break-anywhere text-sm font-semibold text-slate-950">{value}</p></div>;
}

function RefreshIcon() {
  return <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />;
}
