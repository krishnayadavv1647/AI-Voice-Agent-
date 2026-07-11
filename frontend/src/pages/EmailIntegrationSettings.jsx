import { AlertTriangle, CheckCircle2, Mail, RefreshCw, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";

function messageFrom(error) {
  return error.response?.message || error.message || "Request failed.";
}

function timeLabel(value) {
  return value ? new Date(value).toLocaleString() : "Not synced yet";
}

const ERROR_REASONS = {
  invalid_state: "The connection request expired or was tampered with. Please try again.",
  missing_code: "Google did not return an authorization code. Please try again.",
  connection_failed: "We could not complete the Gmail connection. Please try again.",
  access_denied: "You declined the Gmail permission request."
};

export default function EmailIntegrationSettings() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  const gmail = status?.integration?.gmail;
  const connected = Boolean(gmail?.connected);

  async function loadStatus() {
    const result = await api("/email-integrations/status");
    setStatus(result);
  }

  useEffect(() => {
    loadStatus().catch((err) => setError(messageFrom(err)));
  }, []);

  // Handle the OAuth redirect result (?gmail=connected | ?gmail=error&reason=...).
  useEffect(() => {
    const gmailResult = searchParams.get("gmail");
    if (!gmailResult) return;
    if (gmailResult === "connected") {
      setNotice("Gmail connected. Your inbox is syncing now.");
      loadStatus().catch(() => {});
    } else if (gmailResult === "error") {
      const reason = searchParams.get("reason") || "";
      setError(ERROR_REASONS[reason] || "Gmail connection failed. Please try again.");
    }
    // Strip the query params so a refresh doesn't re-trigger the banner.
    const next = new URLSearchParams(searchParams);
    next.delete("gmail");
    next.delete("reason");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function connectGmail() {
    setBusy("connect");
    setError("");
    try {
      const result = await api("/email-integrations/gmail/auth-url");
      window.location.href = result.authUrl;
    } catch (err) {
      setError(messageFrom(err));
      setBusy("");
    }
  }

  async function loadOlderEmails() {
    await run("load-more", async () => {
      const result = await api("/email-integrations/gmail/import-more", { method: "POST" });
      if (!result.hasMore) setNotice("No more older emails are available.");
    }, "Older emails imported.");
  }

  return (
    <div className="page-stack">
      <PageHeader title="Email Integration" description="Connect Gmail to view, send, reply to, and manage email from your account." />

      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <section className="card space-y-5">
        <div className="flex items-start gap-3">
          <div className="icon-tile"><Mail size={18} /></div>
          <div>
            <h2 className="panel-title">Gmail</h2>
            <p className="text-sm text-neutral-500">
              {connected ? "Your Gmail account is connected." : "Connect Gmail to view, send, reply to, and manage emails from this app."}
            </p>
          </div>
        </div>

        {!connected ? (
          <div className="rounded-xl border border-dashed border-hairline p-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-neutral-100">
              <Mail size={22} className="text-neutral-600" />
            </div>
            <p className="text-sm text-neutral-600">
              Connect your Gmail account to send campaigns, reply to leads, and keep every conversation in one inbox.
              Emails are sent from your real Gmail address.
            </p>
            <button className="btn-primary mx-auto mt-4" disabled={busy === "connect"} onClick={connectGmail}>
              <Mail size={16} />{busy === "connect" ? "Redirecting to Google…" : "Connect Gmail"}
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 rounded-xl bg-neutral-50 p-4 sm:grid-cols-2">
              <Info label="Connected Account" value={gmail.email} />
              <Info label="Name" value={gmail.displayName || "—"} />
              <Info label="Last Synced" value={timeLabel(gmail.lastSyncedAt)} />
              <Info label="Sync Status" value={gmail.syncStatus === "error" ? "Needs attention" : gmail.syncStatus} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <StatusPill label="Sending" ok={gmail.canSend} />
              <StatusPill label="Receiving" ok={gmail.canRead} />
              <StatusPill label="Automatic Sync" ok={gmail.syncEnabled && gmail.syncStatus !== "error"} />
            </div>

            {gmail.syncStatus === "error" && gmail.lastErrorType === "auth" && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>Gmail authorization expired. Reconnect Gmail to resume sending and syncing.</span>
              </div>
            )}

            <div className="action-row">
              <button className="btn-secondary" disabled={busy === "sync"} onClick={() => run("sync", () => api("/email-integrations/sync-now", { method: "POST" }), "Gmail sync complete.")}>
                <RefreshCw size={16} className={busy === "sync" ? "animate-spin" : ""} />{busy === "sync" ? "Syncing…" : "Sync Now"}
              </button>
              {gmail.hasMore && (
                <button className="btn-secondary" disabled={busy === "load-more"} onClick={loadOlderEmails}>
                  {busy === "load-more" ? "Importing…" : "Load Older Emails"}
                </button>
              )}
              <button className="btn-secondary" disabled={busy === "reconnect"} onClick={connectGmail}>
                Reconnect Gmail
              </button>
              <button className="btn-danger" disabled={busy === "disconnect"} onClick={() => run("disconnect", () => api("/email-integrations/gmail", { method: "DELETE" }), "Gmail disconnected.")}>
                <Trash2 size={16} />Disconnect Gmail
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function StatusPill({ label, ok }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div className="rounded-xl bg-neutral-50 p-3">
      <p className="text-xs font-medium uppercase text-neutral-500">{label}</p>
      <p className={`mt-1 flex items-center gap-2 text-sm font-bold ${ok ? "text-emerald-700" : "text-rose-700"}`}>
        <Icon size={16} />{ok ? "Active" : "Not ready"}
      </p>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-neutral-500">{label}</p>
      <p className="break-anywhere text-sm font-semibold text-ink">{value || "Not configured"}</p>
    </div>
  );
}
