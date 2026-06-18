import { History, MailOpen, MessageSquareReply, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const filters = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "needs_reply", label: "Needs Reply" },
  { key: "replied", label: "Replied" },
  { key: "closed", label: "Closed" }
];

function errorText(err) {
  return err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
}

function leadName(lead) {
  return lead?.businessName || lead?.contactName || lead?.name || "Unknown lead";
}

function messageText(message) {
  return message?.textBody || message?.body || String(message?.htmlBody || "").replace(/<[^>]+>/g, " ");
}

function timeLabel(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function refreshUnreadBadge() {
  window.dispatchEvent(new Event("email-unread-count-changed"));
}

export default function EmailInbox() {
  const [searchParams] = useSearchParams();
  const threadParam = searchParams.get("thread") || "";
  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [reply, setReply] = useState({ subject: "", body: "" });
  const [goal, setGoal] = useState("Book a discovery call if the lead is interested");
  const [tone, setTone] = useState("Professional");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [checkingReplies, setCheckingReplies] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [simulateForm, setSimulateForm] = useState({ fromEmail: "", body: "" });
  const [replyCheck, setReplyCheck] = useState({ lastCheckedAt: "", importedCount: 0 });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const visibleThreads = useMemo(() => {
    if (filter === "all") return threads;
    if (filter === "unread") return threads.filter((thread) => thread.status === "needs_reply");
    return threads.filter((thread) => thread.status === filter);
  }, [threads, filter]);

  async function loadThreads(nextSelectedId = selectedId, options = {}) {
    if (!options.silent) setLoading(true);
    const query = filter === "all" ? "" : `?status=${filter}`;
    const list = await api(`/email/threads${query}`);
    setThreads(list);
    const id = nextSelectedId || list[0]?._id || "";
    setSelectedId(id);
    if (!options.silent) setLoading(false);
    if (id) await loadThread(id);
    else setSelected(null);
  }

  async function loadThread(id) {
    setThreadLoading(true);
    const [detail, messages] = await Promise.all([
      api(`/email/threads/${id}`),
      api(`/email/threads/${id}/messages`)
    ]);
    const readResult = await api(`/email/threads/${id}/read`, { method: "POST" });
    if (readResult.markedCount) refreshUnreadBadge();
    setSelected({ ...detail, messages });
    setReply({
      subject: detail.thread.subject?.toLowerCase().startsWith("re:") ? detail.thread.subject : `Re: ${detail.thread.subject || "Following up"}`,
      body: ""
    });
    setThreadLoading(false);
  }

  async function pollReplies({ showNotice = false, silent = false, nextSelectedId = selectedId } = {}) {
    const result = await api("/email/inbound/poll-now", { method: "POST" });
    setReplyCheck({
      lastCheckedAt: new Date().toISOString(),
      importedCount: result.importedCount || 0
    });
    refreshUnreadBadge();
    if (showNotice) {
      setNotice(`Reply check complete: ${result.importedCount || 0} imported, ${result.duplicateCount || 0} duplicates skipped, ${result.skippedNoMatchCount || 0} without a matching lead/thread.`);
    }
    await loadThreads(nextSelectedId, { silent });
    return result;
  }

  useEffect(() => {
    pollReplies({ silent: false, nextSelectedId: threadParam }).catch((err) => {
      setLoading(false);
      setError(errorText(err));
    });
  }, [filter, threadParam]);

  useEffect(() => {
    const interval = setInterval(() => {
      pollReplies({ silent: true }).catch((err) => setError(errorText(err)));
    }, 30000);

    return () => clearInterval(interval);
  }, [filter, selectedId]);

  async function selectThread(id) {
    setSelectedId(id);
    setNotice("");
    setError("");
    try {
      await loadThread(id);
    } catch (err) {
      setError(errorText(err));
      setThreadLoading(false);
    }
  }

  async function generateReply() {
    if (!selectedId) return;
    setGenerating(true);
    setNotice("");
    setError("");
    try {
      const draft = await api(`/email/threads/${selectedId}/generate-reply`, {
        method: "POST",
        body: { goal, tone }
      });
      setReply({ subject: draft.subject || reply.subject, body: draft.body || "" });
      setNotice("AI draft generated. Review it before sending.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setGenerating(false);
    }
  }

  async function sendReply() {
    if (!selectedId || !reply.body.trim()) {
      setError("Write a reply before sending.");
      return;
    }

    setSending(true);
    setNotice("");
    setError("");
    try {
      await api(`/email/threads/${selectedId}/reply`, {
        method: "POST",
        body: reply
      });
      setNotice("Reply sent.");
      await loadThreads(selectedId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  async function backfillThreads() {
    setBackfilling(true);
    setNotice("");
    setError("");
    try {
      const result = await api("/email/backfill-threads", { method: "POST" });
      setNotice(`Backfill complete: ${result.createdMessages || 0} messages created, ${result.skippedMessages || 0} already existed.`);
      await loadThreads(selectedId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBackfilling(false);
    }
  }

  async function checkReplies() {
    setCheckingReplies(true);
    setNotice("");
    setError("");
    try {
      await pollReplies({ showNotice: true, nextSelectedId: selectedId });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setCheckingReplies(false);
    }
  }

  function openSimulateModal() {
    if (!selected?.thread) return;
    setSimulateForm({
      fromEmail: selected.thread.leadId?.email || selected.thread.fromEmail || selected.thread.email || "",
      body: ""
    });
    setSimulateOpen(true);
  }

  async function simulateInboundReply() {
    if (!selectedId) return;
    if (!simulateForm.fromEmail.trim() || !simulateForm.body.trim()) {
      setError("Add a from email and message body.");
      return;
    }

    setSimulating(true);
    setNotice("");
    setError("");
    try {
      await api(`/email/threads/${selectedId}/simulate-inbound`, {
        method: "POST",
        body: simulateForm
      });
      setSimulateOpen(false);
      setNotice("Simulated incoming reply added.");
      await loadThreads(selectedId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSimulating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Email Inbox"
        description="Review lead replies, generate draft responses, and send follow-ups from one place."
        action={(
          <div className="action-row">
            <button className="btn-secondary" disabled={backfilling} onClick={backfillThreads}><History size={16} />{backfilling ? "Backfilling..." : "Backfill Sent Emails"}</button>
            <button className="btn-secondary" disabled={checkingReplies} onClick={checkReplies}><MailOpen size={16} />{checkingReplies ? "Checking..." : "Check Replies"}</button>
            <button className="btn-secondary" onClick={() => loadThreads(selectedId).catch((err) => setError(errorText(err)))}><RefreshCw size={16} />Refresh</button>
          </div>
        )}
      />

      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="mb-4 text-xs font-semibold text-slate-500">
        Last checked: {replyCheck.lastCheckedAt ? new Date(replyCheck.lastCheckedAt).toLocaleTimeString() : "Not yet"} · Imported: {replyCheck.importedCount}
      </div>

      <div className="grid min-h-[calc(100vh-12rem)] gap-4 xl:grid-cols-[25rem_minmax(0,1fr)]">
        <aside className="card flex min-h-0 flex-col p-0">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <button key={item.key} className={filter === item.key ? "tab-button tab-button-active" : "tab-button"} onClick={() => setFilter(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {loading ? (
              <EmptyState title="Loading inbox..." />
            ) : !visibleThreads.length ? (
              <EmptyState title="No email threads" description="Sent campaign emails and replies from leads will appear here." />
            ) : visibleThreads.map((thread) => (
              <button
                key={thread._id}
                className={`mb-2 w-full rounded-2xl border p-3 text-left transition ${selectedId === thread._id ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                onClick={() => selectThread(thread._id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-anywhere text-sm font-bold text-slate-950">{thread.leadName || leadName(thread.leadId)}</p>
                    <p className="break-anywhere text-xs text-slate-500">{thread.email || thread.leadId?.email || thread.fromEmail || thread.toEmail || "-"}</p>
                  </div>
                  <StatusBadge status={thread.status} />
                </div>
                <p className="mt-2 break-anywhere text-sm font-semibold text-slate-800">{thread.subject || "No subject"}</p>
                <p className="mt-1 line-clamp-2 break-anywhere text-xs text-slate-500">{thread.lastMessagePreview || "No messages yet"}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span>{timeLabel(thread.lastMessageAt)}</span>
                  <span>{thread.messagesCount || 0} messages{thread.unreadCount ? ` - ${thread.unreadCount} unread` : ""}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="card min-h-0 p-0">
          {!selected ? (
            <div className="grid h-full min-h-[28rem] place-items-center p-6">
              <EmptyState title="Select a thread" description="Choose a lead conversation to review messages and compose a reply." />
            </div>
          ) : (
            <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="flex min-h-0 flex-col border-r border-slate-200">
                <div className="border-b border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-anywhere text-lg font-bold text-slate-950">{selected.thread.subject || "Email conversation"}</h2>
                      <p className="break-anywhere text-sm text-slate-500">{leadName(selected.thread.leadId)} - {selected.thread.leadId?.email || selected.thread.fromEmail}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn-secondary" onClick={openSimulateModal}><MessageSquareReply size={16} />Simulate Incoming Reply</button>
                      <StatusBadge status={selected.thread.status} />
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-slate-50 p-4">
                  {threadLoading ? (
                    <EmptyState title="Loading conversation..." />
                  ) : selected.messages.map((message) => (
                    <article key={message._id} className={`max-w-[48rem] rounded-2xl border p-4 ${message.direction === "outbound" ? "ml-auto border-brand-100 bg-white" : "mr-auto border-amber-100 bg-amber-50/40"}`}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span className={`rounded-full px-2 py-1 font-semibold uppercase ${message.direction === "outbound" ? "bg-brand-50 text-brand-700" : "bg-amber-100 text-amber-800"}`}>{message.direction}</span>
                        <span>{timeLabel(message.sentAt || message.receivedAt || message.createdAt)}</span>
                      </div>
                      <p className="break-anywhere text-xs text-slate-500">{message.fromEmail} to {message.toEmail}</p>
                      <p className="mt-3 whitespace-pre-wrap break-anywhere text-sm text-slate-800">{messageText(message)}</p>
                    </article>
                  ))}
                </div>

                <div className="border-t border-slate-200 bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
                    <input value={reply.subject} onChange={(event) => setReply((current) => ({ ...current, subject: event.target.value }))} placeholder="Subject" />
                    <select value={tone} onChange={(event) => setTone(event.target.value)}>
                      {["Professional", "Friendly", "Concise", "Warm"].map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                  <input className="mt-3" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Reply goal" />
                  <textarea className="mt-3" rows={7} value={reply.body} onChange={(event) => setReply((current) => ({ ...current, body: event.target.value }))} placeholder="Write a reply or generate a draft" />
                  <div className="mt-3 action-row">
                    <button className="btn-secondary" disabled={generating} onClick={generateReply}><Sparkles size={16} />{generating ? "Generating..." : "AI Generate Reply"}</button>
                    <button className="btn-primary" disabled={sending || !reply.body.trim()} onClick={sendReply}><Send size={16} />{sending ? "Sending..." : "Send Reply"}</button>
                  </div>
                </div>
              </div>

              <aside className="space-y-3 p-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center gap-2 font-bold text-slate-950"><MailOpen size={18} />Lead Details</div>
                  <Info label="Business" value={selected.thread.leadId?.businessName || selected.thread.leadId?.name} />
                  <Info label="Email" value={selected.thread.leadId?.email} />
                  <Info label="Phone" value={selected.thread.leadId?.phone} />
                  <Info label="Status" value={selected.thread.leadId?.status} />
                  <Info label="Campaign" value={selected.thread.campaignId?.name} />
                  <Info label="Agent" value={selected.thread.agentId?.agentName} />
                </div>
              </aside>
            </div>
          )}
        </section>
      </div>

      {simulateOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setSimulateOpen(false)}>
          <div className="modal-panel rounded-3xl bg-white p-4 shadow-2xl sm:max-w-xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Simulate Incoming Reply</h2>
                <p className="text-sm text-slate-500">Add a test lead reply to this email thread.</p>
              </div>
              <button className="rounded-xl border border-slate-200 p-2" onClick={() => setSimulateOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">From Email</span>
              <input value={simulateForm.fromEmail} onChange={(event) => setSimulateForm((current) => ({ ...current, fromEmail: event.target.value }))} placeholder="lead@example.com" />
            </label>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Message Body</span>
              <textarea rows={7} value={simulateForm.body} onChange={(event) => setSimulateForm((current) => ({ ...current, body: event.target.value }))} placeholder="Thanks, I am interested. Can you share more details?" />
            </label>
            <div className="mt-4 action-row">
              <button className="btn-primary" disabled={simulating || !simulateForm.fromEmail.trim() || !simulateForm.body.trim()} onClick={simulateInboundReply}>
                <MessageSquareReply size={16} />{simulating ? "Adding..." : "Add Incoming Reply"}
              </button>
              <button className="btn-secondary" onClick={() => setSimulateOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Info({ label, value }) {
  return (
    <div className="border-t border-slate-100 py-2 first:border-t-0">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="break-anywhere text-sm font-semibold text-slate-950">{value || "Not provided"}</p>
    </div>
  );
}
