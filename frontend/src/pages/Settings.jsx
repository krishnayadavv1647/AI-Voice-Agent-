import { Bell, CreditCard, KeyRound, Lock, Mail, MessageCircle, Save, Send, ShieldCheck, User } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../state/AuthContext.jsx";

const tabs = [
  { key: "general", label: "General" },
  { key: "notifications", label: "Notifications" },
  { key: "messaging", label: "Messaging" },
  { key: "team", label: "Team" },
  { key: "email", label: "Email" }
];

export default function Settings() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState({ leads: true, calls: true, weekly: false, failures: true });
  const [telegram, setTelegram] = useState(null);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramMessage, setTelegramMessage] = useState("");

  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const tabRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const el = tabRefs.current[active];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active]);

  useEffect(() => {
    function onResize() {
      const el = tabRefs.current[active];
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active]);

  function goToTab(index) {
    if (index === active) return;
    setDirection(index >= active ? 1 : -1);
    setActive(index);
  }

  useEffect(() => {
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

  const activeKey = tabs[active].key;

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Manage account preferences, notifications, team controls, and supporting integrations." />

      <div className="settings-tabs-shell sticky top-0 z-10 -mt-2 backdrop-blur">
        <div className="settings-tabs relative overflow-x-auto border-b border-hairline">
          <div className="flex min-w-max gap-1">
            {tabs.map((tab, index) => (
              <button
                key={tab.key}
                ref={(el) => (tabRefs.current[index] = el)}
                onClick={() => goToTab(index)}
                className={`whitespace-nowrap rounded-t-lg px-5 py-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 ${
                  active === index ? "font-semibold text-ink" : "font-medium text-neutral-500 hover:text-ink"
                }`}
                aria-current={active === index ? "page" : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span
            className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-brand-600 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
            style={{ left: indicator.left, width: indicator.width }}
          />
        </div>
      </div>

      <div key={active} className={direction >= 0 ? "settings-panel-right" : "settings-panel-left"}>
        {activeKey === "general" && (
          <TabView title="General" description="Profile, access, billing, and API visibility.">
            <div className="grid min-w-0 gap-6 xl:grid-cols-2">
              <Panel icon={User} title="Profile" description="Read-only account identity for this workspace.">
                <label className="field-label">Profile name<input value={user?.name || ""} readOnly /></label>
                <label className="field-label">Email<input value={user?.email || ""} readOnly /></label>
                <button className="btn-secondary w-fit" onClick={() => alert("Profile editing can be connected next.")}><Save size={16} />Save Changes</button>
              </Panel>

              <Panel icon={Lock} title="Security" description="Password settings for the current account.">
                <input type="password" aria-label="Current password" placeholder="Current password" />
                <input type="password" aria-label="New password" placeholder="New password" />
                <button className="btn-secondary w-fit" onClick={() => alert("Password change endpoint can be connected next.")}>Update Password</button>
              </Panel>

              <Panel icon={KeyRound} title="API Keys" description="Credentials are managed in dedicated integration pages. Full keys are never exposed in the browser.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link className="btn-secondary" to="/settings/email"><Mail size={16} />Manage Email</Link>
                </div>
              </Panel>

              <Panel icon={CreditCard} title="Billing & Usage Limits" description="Plan details and limits for the workspace.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="Plan" value={user?.plan || "Free"} />
                  <Info label="Minutes limit" value="Placeholder" />
                </div>
              </Panel>
            </div>
          </TabView>
        )}

        {activeKey === "notifications" && (
          <TabView title="Notifications" description="Choose which operational events should notify your team.">
            <Panel icon={Bell} title="Notification Preferences">
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(notifications).map(([key, value]) => (
                  <label key={key} className="flex items-center justify-between rounded-xl border border-hairline p-3 text-sm font-medium capitalize">
                    {key}
                    <input className="h-5 w-5" type="checkbox" checked={value} onChange={(event) => setNotifications({ ...notifications, [key]: event.target.checked })} />
                  </label>
                ))}
              </div>
            </Panel>
          </TabView>
        )}

        {activeKey === "messaging" && (
          <TabView title="Messaging" description="Connect Telegram for operational alerts and summaries.">
            <Panel icon={MessageCircle} title="Telegram Integration" description="Generate a code, connect the bot, and control alert types.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Status" value={telegram?.status || "Not connected"} />
                <Info label="Bot" value={telegram?.botUsername || "Configure TELEGRAM_BOT_USERNAME"} />
                <Info label="Telegram User" value={telegram?.telegramUsername || "Not connected"} />
                <Info label="Connected At" value={telegram?.connectedAt ? new Date(telegram.connectedAt).toLocaleString() : "Not connected"} />
              </div>

              {telegram?.botLink && <a className="btn-secondary w-fit" href={telegram.botLink} target="_blank" rel="noreferrer"><Send size={16} />Open Telegram Bot</a>}

              {telegramCode && (
                <div className="rounded-xl bg-brand-50 p-4">
                  <p className="text-xs font-semibold uppercase text-brand-700">Connect Code</p>
                  <p className="mt-1 text-2xl font-semibold tracking-wide text-brand-700">{telegramCode}</p>
                  <p className="mt-1 break-anywhere text-sm text-neutral-600">Send: /connect {telegramCode}</p>
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
                  <label key={field} className="flex items-center justify-between rounded-xl border border-hairline p-3 text-sm font-medium">
                    {label}
                    <input className="h-5 w-5" type="checkbox" disabled={telegram?.status !== "connected"} checked={Boolean(telegram?.[field])} onChange={(event) => updateTelegramSetting(field, event.target.checked)} />
                  </label>
                ))}
              </div>
              {telegramMessage && <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">{telegramMessage}</p>}
            </Panel>
          </TabView>
        )}

        {activeKey === "team" && (
          <TabView title="Team" description="Role and member controls for future collaboration workflows.">
            <Panel icon={ShieldCheck} title="Team">
              <p className="text-sm leading-6 text-neutral-500">Team access and role controls are reserved for the next plan level.</p>
              <button className="btn-secondary mt-4 w-fit" disabled>Invite Member</button>
            </Panel>
          </TabView>
        )}

        {activeKey === "email" && (
          <TabView title="Email" description="Connect Gmail to view, send, reply to, and manage email from your account.">
            <LinkCard icon={Mail} title="Email Integration" description="Connect Gmail to view, send, reply to, and manage email from your account." to="/settings/email" cta="Open Email Settings" />
          </TabView>
        )}

      </div>
    </div>
  );
}

function TabView({ title, description, children }) {
  return (
    <section className="space-y-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-5 text-neutral-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Panel({ icon: Icon, title, description, children }) {
  return (
    <section className="card space-y-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="icon-tile"><Icon size={18} /></div>
        <div className="min-w-0">
          <h3 className="panel-title min-w-0 break-anywhere">{title}</h3>
          {description && <p className="mt-1 text-[13px] leading-5 text-neutral-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function LinkCard({ icon, title, description, to, cta }) {
  return (
    <Panel icon={icon} title={title} description={description}>
      <Link className="btn-secondary w-fit" to={to}>{cta}</Link>
    </Panel>
  );
}

function Info({ label, value }) {
  return <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs font-medium uppercase text-neutral-500">{label}</p><p className="break-anywhere text-sm font-semibold text-ink">{value}</p></div>;
}

function RefreshIcon() {
  return <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />;
}
