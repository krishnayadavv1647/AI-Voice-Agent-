import { CheckCircle2, KeyRound, Mail, RefreshCw, Save, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";

const defaultBrevo = { apiKey: "", senderId: "", senderName: "", senderEmail: "", replyToName: "", replyToEmail: "" };
const defaultImap = { email: "", host: "imap.gmail.com", port: 993, secure: true, username: "", password: "" };

function messageFrom(error) {
  return error.response?.message || error.message || "Request failed.";
}

function timeLabel(value) {
  return value ? new Date(value).toLocaleString() : "Not synced yet";
}

export default function EmailIntegrationSettings() {
  const [status, setStatus] = useState(null);
  const [brevoForm, setBrevoForm] = useState(defaultBrevo);
  const [imapForm, setImapForm] = useState(defaultImap);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [verifiedSenders, setVerifiedSenders] = useState([]);
  const [sendersLoading, setSendersLoading] = useState(false);
  const [sendersError, setSendersError] = useState("");

  const integration = status?.integration;
  const replyMismatch = useMemo(() => {
    const replyTo = integration?.brevo?.replyToEmail?.toLowerCase();
    const mailbox = integration?.inbound?.email?.toLowerCase();
    return Boolean(replyTo && mailbox && replyTo !== mailbox);
  }, [integration]);

  async function loadStatus() {
    const result = await api("/email-integrations/status");
    setStatus(result);
    setBrevoForm((current) => ({
      ...current,
      senderName: result.integration?.brevo?.senderName || current.senderName,
      senderEmail: result.integration?.brevo?.senderEmail || current.senderEmail,
      senderId: result.integration?.brevo?.senderId || current.senderId,
      replyToName: result.integration?.brevo?.replyToName || current.replyToName,
      replyToEmail: result.integration?.brevo?.replyToEmail || current.replyToEmail
    }));
    setImapForm((current) => ({
      ...current,
      email: result.integration?.inbound?.email || current.email,
      host: result.integration?.inbound?.host || current.host,
      port: result.integration?.inbound?.port || current.port,
      secure: result.integration?.inbound?.secure ?? current.secure,
      username: result.integration?.inbound?.username || current.username
    }));
  }

  useEffect(() => {
    loadStatus().catch((err) => setError(messageFrom(err)));
  }, []);

  useEffect(() => {
    if (integration?.brevo?.hasApiKey || integration?.brevo?.connected) {
      loadVerifiedSenders().catch(() => {});
    }
  }, [integration?.brevo?.hasApiKey, integration?.brevo?.connected]);

  async function run(label, action, success) {
    setBusy(label);
    setNotice("");
    setError("");
    try {
      await action();
      await loadStatus();
      if (success) setNotice(success);
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setBusy("");
    }
  }

  async function connectBrevo() {
    await run("brevo", () => api("/email-integrations/brevo/connect", { method: "POST", body: brevoForm }), "Brevo connected.");
    setBrevoForm((current) => ({ ...current, apiKey: "" }));
  }

  async function validateBrevo() {
    if (!brevoForm.apiKey.trim()) {
      setError("Enter your Brevo API key.");
      return;
    }
    setBusy("brevo-validate");
    setSendersLoading(true);
    setSendersError("");
    setNotice("");
    setError("");
    try {
      const result = await api("/email-integrations/brevo/validate", { method: "POST", body: { apiKey: brevoForm.apiKey.trim() } });
      const senders = Array.isArray(result.senders) ? result.senders : [];
      setVerifiedSenders(senders);
      setStatus((current) => ({
        ...(current || {}),
        integration: {
          ...(current?.integration || {}),
          brevo: { ...(current?.integration?.brevo || {}), hasApiKey: true, accountEmail: result.account?.email || "", verifiedSenders: senders }
        }
      }));
      setNotice(senders.length ? `${senders.length} Brevo sender${senders.length === 1 ? "" : "s"} loaded.` : "No Brevo sender found. Add and verify a sender in your Brevo account, then reload senders.");
    } catch (err) {
      setVerifiedSenders([]);
      setSendersError(messageFrom(err) || "Unable to validate the Brevo API key.");
      setError(messageFrom(err) || "Unable to validate the Brevo API key.");
    } finally {
      setSendersLoading(false);
      setBusy("");
    }
  }

  async function loadVerifiedSenders() {
    setSendersLoading(true);
    setSendersError("");
    try {
      const result = await api("/email-integrations/brevo/senders");
      const senders = Array.isArray(result.senders) ? result.senders : [];
      setVerifiedSenders(senders);
      setStatus((current) => ({
        ...(current || {}),
        integration: {
          ...(current?.integration || {}),
          brevo: { ...(current?.integration?.brevo || {}), verifiedSenders: senders }
        }
      }));
      if (!senders.length) setSendersError("No Brevo sender found. Add and verify a sender in your Brevo account, then reload senders.");
    } catch (err) {
      setVerifiedSenders([]);
      setSendersError(messageFrom(err) || "Unable to load verified Brevo senders.");
    } finally {
      setSendersLoading(false);
    }
  }

  function selectSender(email) {
    const selectedSender = verifiedSenders.find((sender) => sender.email === email);
    setBrevoForm((current) => ({
      ...current,
      senderEmail: email,
      senderId: selectedSender?.id || "",
      senderName: selectedSender?.name || current.senderName
    }));
  }

  async function saveBrevoSender() {
    await run("brevo-save", () => api("/email-integrations/brevo/sender", { method: "PATCH", body: brevoForm }), "Brevo sender settings saved.");
  }

  async function connectImap() {
    await run("imap", () => api("/email-integrations/imap/connect", { method: "POST", body: { ...imapForm, port: Number(imapForm.port) } }), "Receiving mailbox connected.");
    setImapForm((current) => ({ ...current, password: "" }));
  }

  async function testImap() {
    await run("imap-test", () => api("/email-integrations/imap/test", { method: "POST", body: { ...imapForm, port: Number(imapForm.port) } }), "Mailbox connection works.");
  }

  async function syncNow() {
    await run("sync", () => api("/email-integrations/sync-now", { method: "POST" }), "Mailbox sync complete.");
    window.dispatchEvent(new Event("email-unread-count-changed"));
  }

  function useMailboxAsReplyTo() {
    setBrevoForm((current) => ({ ...current, replyToEmail: integration?.inbound?.email || "" }));
  }

  return (
    <div className="page-stack">
      <PageHeader title="Email Integrations" description="Connect your own sending account and receiving mailbox." />

      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <section className="card space-y-4">
        <div className="flex items-start gap-3">
          <div className="icon-tile"><ShieldCheck size={18} /></div>
          <div>
            <h2 className="panel-title">Email Setup Status</h2>
            <p className="text-sm text-slate-500">Sending and receiving stay isolated to your account.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Status label="Brevo Sending" ok={integration?.brevo?.connected} />
          <Status label="Receiving Mailbox" ok={integration?.inbound?.connected} />
          <Status label="Verified Sender" ok={integration?.brevo?.verifiedSender} />
          <Status label="Reply-To Match" ok={integration?.setup?.replyToMatchesMailbox} />
          <Status label="Automatic Sync" ok={integration?.inbound?.syncEnabled && integration?.inbound?.syncStatus !== "error"} />
        </div>
        {replyMismatch && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Your Reply-To email does not match your connected receiving mailbox. Customer replies may not appear in your app.
            <button className="btn-secondary mt-3" onClick={useMailboxAsReplyTo}>Use Connected Mailbox as Reply-To</button>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card space-y-4">
          <div className="flex items-start gap-3">
            <div className="icon-tile"><KeyRound size={18} /></div>
            <div>
              <h2 className="panel-title">Brevo Email Sending</h2>
              <p className="text-sm text-slate-500">Send email through your own Brevo account.</p>
            </div>
          </div>

          {integration?.brevo?.connected && (
            <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
              <Info label="Status" value="Connected" />
              <Info label="Account" value={integration.brevo.accountEmail || "Connected"} />
              <Info label="Sender" value={integration.brevo.senderEmail} />
              <Info label="Reply-To" value={integration.brevo.replyToEmail} />
              <Info label="API Key" value={integration.brevo.maskedApiKey} />
            </div>
          )}

          <label className="field-label">Brevo API Key<input type="password" value={brevoForm.apiKey} onChange={(event) => setBrevoForm({ ...brevoForm, apiKey: event.target.value })} placeholder={integration?.brevo?.maskedApiKey || "xkeysib-..."} /></label>
          <label className="field-label">Sender Name<input value={brevoForm.senderName} onChange={(event) => setBrevoForm({ ...brevoForm, senderName: event.target.value })} /></label>
          <label className="field-label">Verified Sender Email
            <select value={brevoForm.senderEmail || ""} disabled={sendersLoading || verifiedSenders.length === 0} onChange={(event) => selectSender(event.target.value)}>
              <option value="">
                {sendersLoading ? "Loading verified senders..." : verifiedSenders.length === 0 ? "No verified sender found" : "Select verified sender"}
              </option>
              {verifiedSenders.map((sender) => <option key={sender.id || sender.email} value={sender.email}>{sender.name} - {sender.email}</option>)}
            </select>
            {sendersError && <p className="mt-1 text-sm text-rose-600">{sendersError}</p>}
          </label>
          <label className="field-label">Reply-To Name<input value={brevoForm.replyToName} onChange={(event) => setBrevoForm({ ...brevoForm, replyToName: event.target.value })} /></label>
          <label className="field-label">Reply-To Email<input value={brevoForm.replyToEmail} onChange={(event) => setBrevoForm({ ...brevoForm, replyToEmail: event.target.value })} /></label>

          <div className="action-row">
            <button className="btn-secondary" disabled={!brevoForm.apiKey || busy === "brevo-validate"} onClick={validateBrevo}><RefreshCw size={16} />{busy === "brevo-validate" ? "Loading..." : "Verify API Key & Load Senders"}</button>
            <button className="btn-secondary" disabled={sendersLoading || !(integration?.brevo?.hasApiKey || integration?.brevo?.connected)} onClick={() => loadVerifiedSenders().catch((err) => setError(messageFrom(err)))}><RefreshCw size={16} />Reload Senders</button>
            <button className="btn-primary" disabled={busy === "brevo" || !brevoForm.senderEmail || !brevoForm.replyToEmail} onClick={connectBrevo}><Save size={16} />{busy === "brevo" ? "Saving..." : "Save Brevo Configuration"}</button>
            <button className="btn-secondary" disabled={!integration?.brevo?.connected || busy === "brevo-save"} onClick={saveBrevoSender}>Save Changes</button>
            <button className="btn-danger" disabled={!integration?.brevo?.connected} onClick={() => run("brevo-disconnect", () => api("/email-integrations/brevo", { method: "DELETE" }), "Brevo disconnected.")}><Trash2 size={16} />Disconnect</button>
          </div>
        </section>

        <section className="card space-y-4">
          <div className="flex items-start gap-3">
            <div className="icon-tile"><Mail size={18} /></div>
            <div>
              <h2 className="panel-title">Receiving Mailbox</h2>
              <p className="text-sm text-slate-500">Connect the inbox where customer replies should arrive.</p>
            </div>
          </div>

          {integration?.inbound?.connected && (
            <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
              <Info label="Status" value="Connected" />
              <Info label="Mailbox" value={integration.inbound.email} />
              <Info label="Provider" value={integration.inbound.provider === "gmail_oauth" ? "Gmail OAuth" : "Gmail IMAP"} />
              <Info label="Last Sync" value={timeLabel(integration.inbound.lastSyncedAt)} />
              <Info label="Auto Sync" value={integration.inbound.syncStatus === "error" ? "Needs attention" : "Active"} />
            </div>
          )}

          <button className="btn-secondary" onClick={() => run("gmail", async () => {
            const result = await api("/email-integrations/gmail/auth-url");
            window.location.href = result.authUrl;
          })}>Connect Gmail</button>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-3 text-sm font-bold text-slate-950">Connect with IMAP</p>
            <div className="field-grid">
              <input placeholder="Email Address" value={imapForm.email} onChange={(event) => setImapForm({ ...imapForm, email: event.target.value, username: imapForm.username || event.target.value })} />
              <input placeholder="IMAP Host" value={imapForm.host} onChange={(event) => setImapForm({ ...imapForm, host: event.target.value })} />
              <input placeholder="IMAP Port" type="number" value={imapForm.port} onChange={(event) => setImapForm({ ...imapForm, port: event.target.value })} />
              <input placeholder="Username" value={imapForm.username} onChange={(event) => setImapForm({ ...imapForm, username: event.target.value })} />
              <input placeholder="App Password" type="password" value={imapForm.password} onChange={(event) => setImapForm({ ...imapForm, password: event.target.value })} />
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input className="h-4 w-4" type="checkbox" checked={imapForm.secure} onChange={(event) => setImapForm({ ...imapForm, secure: event.target.checked })} />Use Secure Connection</label>
            </div>
            <p className="mt-3 text-sm text-slate-500">For Gmail IMAP, use a Google App Password instead of your normal Gmail password.</p>
          </div>

          <div className="action-row">
            <button className="btn-secondary" disabled={busy === "imap-test"} onClick={testImap}>Test Connection</button>
            <button className="btn-primary" disabled={busy === "imap"} onClick={connectImap}>Connect with IMAP</button>
            <button className="btn-secondary" disabled={!integration?.inbound?.connected || busy === "sync"} onClick={syncNow}><RefreshCw size={16} />Sync Now</button>
            <button className="btn-danger" disabled={!integration?.inbound?.connected} onClick={() => run("imap-disconnect", () => api("/email-integrations/imap", { method: "DELETE" }), "Mailbox disconnected.")}><Trash2 size={16} />Disconnect</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Status({ label, ok }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className={`mt-1 flex items-center gap-2 text-sm font-bold ${ok ? "text-emerald-700" : "text-rose-700"}`}><Icon size={16} />{ok ? "Connected" : "Not ready"}</p></div>;
}

function Info({ label, value }) {
  return <div><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="break-anywhere text-sm font-semibold text-slate-950">{value || "Not configured"}</p></div>;
}
