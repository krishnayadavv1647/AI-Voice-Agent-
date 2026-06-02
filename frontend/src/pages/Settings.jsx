import { Bell, CreditCard, KeyRound, Lock, PhoneCall, Save, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../state/AuthContext.jsx";

export default function Settings() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState({ leads: true, calls: true, weekly: false, failures: true });
  const [telephonyConfigs, setTelephonyConfigs] = useState([]);
  const [telephonyForm, setTelephonyForm] = useState({
    name: "",
    provider: "twilio",
    phoneNumber: "",
    accountSid: "",
    authToken: "",
    apiKey: "",
    apiSecret: "",
    appId: "",
    webhookUrl: ""
  });
  const [telephonyMessage, setTelephonyMessage] = useState("");

  useEffect(() => {
    loadTelephonyConfigs();
  }, []);

  async function loadTelephonyConfigs() {
    try {
      setTelephonyConfigs(await api("/telephony-configs"));
    } catch (error) {
      setTelephonyMessage(error.message);
    }
  }

  async function saveTelephonyConfig() {
    setTelephonyMessage("");
    try {
      await api("/telephony-configs", { method: "POST", body: telephonyForm });
      setTelephonyForm({ ...telephonyForm, name: "", phoneNumber: "", accountSid: "", authToken: "", apiKey: "", apiSecret: "", appId: "", webhookUrl: "" });
      setTelephonyMessage("Telephony config saved.");
      await loadTelephonyConfigs();
    } catch (error) {
      setTelephonyMessage(error.message);
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
    <>
      <PageHeader title="Settings" description="Manage profile, team, API keys, billing placeholders, usage limits, notifications, and security." />
      <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:gap-6">
        <Panel icon={Users} title="Profile">
          <label className="block text-sm font-semibold text-slate-700">Profile name<input className="mt-1" value={user?.name || ""} readOnly /></label>
          <label className="block text-sm font-semibold text-slate-700">Email<input className="mt-1" value={user?.email || ""} readOnly /></label>
          <button className="btn-secondary" onClick={() => alert("Profile editing can be connected next.")}><Save size={16} />Save Changes</button>
        </Panel>

        <Panel icon={Lock} title="Security">
          <input type="password" aria-label="Current password" placeholder="Current password" />
          <input type="password" aria-label="New password" placeholder="New password" />
          <button className="btn-secondary" onClick={() => alert("Password change endpoint can be connected next.")}>Update Password</button>
        </Panel>

        <Panel icon={KeyRound} title="API Keys">
          <p className="text-sm leading-6 text-slate-500">Dograh and Gemini credentials are server-only. Full keys are never exposed in the frontend.</p>
          <input value="DOGRAH_API_KEY: •••••••••••• connected" readOnly />
          <input value="GEMINI_API_KEY: •••••••••••• connected" readOnly />
        </Panel>

        <Panel icon={CreditCard} title="Billing & Usage Limits">
          <p className="text-sm leading-6 text-slate-500">Billing is ready for Razorpay/Stripe integration. Usage limits can be enforced when plans are connected.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Plan" value={user?.plan || "Free"} />
            <Info label="Minutes limit" value="Placeholder" />
          </div>
        </Panel>

        <Panel icon={Bell} title="Notifications">
          {Object.entries(notifications).map(([key, value]) => (
            <label key={key} className="flex items-center justify-between rounded-2xl border border-slate-200 p-3 text-sm font-semibold capitalize">
              {key}
              <input className="h-5 w-5" type="checkbox" checked={value} onChange={(event) => setNotifications({ ...notifications, [key]: event.target.checked })} />
            </label>
          ))}
        </Panel>

        <Panel icon={PhoneCall} title="Telephony Settings">
          <p className="text-sm leading-6 text-slate-500">Add Twilio, Exotel, or Vonage numbers. Secret values are masked after saving.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input placeholder="Config name" value={telephonyForm.name} onChange={(event) => setTelephonyForm({ ...telephonyForm, name: event.target.value })} />
            <select value={telephonyForm.provider} onChange={(event) => setTelephonyForm({ ...telephonyForm, provider: event.target.value })}>
              <option value="twilio">Twilio</option>
              <option value="exotel">Exotel</option>
              <option value="vonage">Vonage</option>
            </select>
            <input placeholder="Phone number" value={telephonyForm.phoneNumber} onChange={(event) => setTelephonyForm({ ...telephonyForm, phoneNumber: event.target.value })} />
            <input placeholder="Account SID / API key" value={telephonyForm.accountSid} onChange={(event) => setTelephonyForm({ ...telephonyForm, accountSid: event.target.value, apiKey: event.target.value })} />
            <input placeholder="Auth token / API secret" type="password" value={telephonyForm.authToken} onChange={(event) => setTelephonyForm({ ...telephonyForm, authToken: event.target.value, apiSecret: event.target.value })} />
            <input placeholder="Generated by backend after saving" value={telephonyForm.webhookUrl || ""} readOnly />
          </div>
          <button className="btn-secondary" onClick={saveTelephonyConfig}>Save Telephony Config</button>
          {telephonyMessage && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{telephonyMessage}</p>}
          <div className="space-y-2">
            {telephonyConfigs.map((config) => (
              <div key={config._id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{config.name}</p>
                    <p className="break-anywhere text-sm text-slate-500">{config.provider} · {config.phoneNumber}</p>
                  </div>
                  <button className="btn-secondary" onClick={() => testTelephonyConfig(config._id)}>Test Connection</button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel icon={ShieldCheck} title="Team">
          <p className="text-sm leading-6 text-slate-500">Team access and role controls are reserved for the next plan level.</p>
          <button className="btn-secondary" disabled>Invite Member</button>
        </Panel>
      </div>
    </>
  );
}

function Panel({ icon: Icon, title, children }) {
  return (
    <section className="card space-y-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="icon-tile"><Icon size={18} /></div>
        <h2 className="panel-title min-w-0 break-anywhere">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Info({ label, value }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="break-anywhere font-bold text-slate-950">{value}</p></div>;
}
