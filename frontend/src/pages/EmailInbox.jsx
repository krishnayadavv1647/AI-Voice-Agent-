import { ChevronDown, ChevronLeft, RefreshCw, Search, Send, Sparkles, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
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

function splitQuotedText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const quoteIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return /^On .+ wrote:\s*$/i.test(trimmed) || /^>/.test(trimmed) || /^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmed);
  });

  if (quoteIndex === -1) return { main: text, quoted: "" };
  return {
    main: lines.slice(0, quoteIndex).join("\n").trim(),
    quoted: lines.slice(quoteIndex).join("\n").trim()
  };
}

function timeLabel(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function shortTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if ((now - date) / 86400000 < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function threadName(thread) {
  const name = thread.leadName || thread.leadId?.businessName || thread.leadId?.contactName || thread.leadId?.name;
  return name || thread.email || thread.leadId?.email || thread.fromEmail || thread.toEmail || "Unknown";
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
  const [checkingReplies, setCheckingReplies] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState("");
  const [leadDetailsOpen, setLeadDetailsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mobileView, setMobileView] = useState("list");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const selectedIdRef = useRef("");
  const syncingRef = useRef(false);

  const visibleThreads = useMemo(() => {
    const byStatus = filter === "all"
      ? threads
      : filter === "unread"
        ? threads.filter((thread) => thread.status === "needs_reply")
        : threads.filter((thread) => thread.status === filter);
    const term = search.trim().toLowerCase();
    if (!term) return byStatus;
    return byStatus.filter((thread) =>
      [threadName(thread), thread.subject, thread.lastMessagePreview, thread.email, thread.leadId?.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [threads, filter, search]);

  async function loadThreads(nextSelectedId = selectedIdRef.current, options = {}) {
    if (!options.silent) setLoading(true);
    const query = filter === "all" ? "" : `?status=${filter}`;
    const list = await api(`/email/threads${query}`);
    setThreads(list);

    const id = nextSelectedId || list[0]?._id || "";
    setSelectedId(id);
    selectedIdRef.current = id;
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

  async function syncInbox({ showError = false } = {}) {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setCheckingReplies(true);
    try {
      setSyncError("");
      await api("/email-integrations/sync-now", { method: "POST" });
      setLastCheckedAt(new Date().toISOString());
      refreshUnreadBadge();
      await loadThreads(selectedIdRef.current, { silent: true });
    } catch (err) {
      if (showError) setError(errorText(err));
      else setSyncError("Could not check for new replies. Try refreshing.");
    } finally {
      syncingRef.current = false;
      setCheckingReplies(false);
    }
  }

  useEffect(() => {
    let disposed = false;

    async function startInbox() {
      try {
        await loadThreads(threadParam || selectedIdRef.current, { silent: false });
        if (!disposed) await syncInbox();
      } catch (err) {
        if (!disposed) {
          setLoading(false);
          setError(errorText(err));
        }
      }
    }

    startInbox();
    const interval = setInterval(() => {
      syncInbox();
    }, 60000);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [filter, threadParam]);

  async function refreshInbox() {
    setNotice("");
    setError("");
    try {
      await loadThreads(selectedIdRef.current, { silent: false });
      await syncInbox({ showError: true });
    } catch (err) {
      setLoading(false);
      setError(errorText(err));
    }
  }

  async function selectThread(id) {
    setSelectedId(id);
    selectedIdRef.current = id;
    setLeadDetailsOpen(false);
    setMobileView("thread");
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

  return (
    <div className="space-y-3">
      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {syncError && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{syncError}</div>}

      <div className="flex h-[calc(100vh-7rem)] min-h-[34rem] gap-4 overflow-hidden lg:grid lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className={`card min-h-0 w-full flex-col overflow-hidden p-0 lg:flex ${mobileView === "thread" ? "hidden" : "flex"}`}>
          <div className="shrink-0 space-y-3 border-b border-hairline p-4">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-ink">Inbox</h1>
              <button
                className="grid h-8 w-8 place-items-center rounded-lg border border-hairline text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 disabled:opacity-50"
                disabled={checkingReplies}
                onClick={refreshInbox}
                aria-label="Refresh inbox"
                title={checkingReplies ? "Checking for new replies…" : `Last checked: ${lastCheckedAt ? new Date(lastCheckedAt).toLocaleTimeString() : "Not yet"}`}
              >
                <RefreshCw size={16} className={checkingReplies ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" />
            </div>
            <div className="-mb-1 flex flex-wrap gap-1.5">
              {filters.map((item) => (
                <button
                  key={item.key}
                  className={`rounded-full px-3 py-1 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 ${filter === item.key ? "bg-ink text-white" : "border border-hairline bg-white text-neutral-600 hover:bg-neutral-50 hover:text-ink"}`}
                  onClick={() => setFilter(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4"><EmptyState title="Loading inbox..." /></div>
            ) : !visibleThreads.length ? (
              <div className="p-4">
                <EmptyState
                  title="No conversations yet"
                  description="Replies from leads will appear here automatically."
                  action={<button className="btn-secondary" disabled={checkingReplies} onClick={refreshInbox}><RefreshCw size={16} />Refresh Inbox</button>}
                />
              </div>
            ) : (
              <div className="divide-y divide-hairline">
                {visibleThreads.map((thread) => {
                  const unread = thread.unreadCount > 0;
                  const active = selectedId === thread._id;
                  return (
                    <button
                      key={thread._id}
                      className={`relative block w-full px-4 py-3 text-left transition ${active ? "bg-neutral-50 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded before:bg-brand-600" : "hover:bg-neutral-50"}`}
                      onClick={() => selectThread(thread._id)}
                    >
                      <div className="flex items-center gap-2">
                        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                        <p className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-semibold text-ink" : "font-medium text-neutral-700"}`} title={threadName(thread)}>
                          {threadName(thread)}
                        </p>
                        <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">{shortTime(thread.lastMessageAt)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <p className={`min-w-0 flex-1 truncate text-[13px] ${unread ? "text-neutral-600" : "text-neutral-500"}`}>
                          {thread.subject ? <span className="text-neutral-500">{thread.subject} · </span> : null}
                          {thread.lastMessagePreview || "No messages yet"}
                        </p>
                        <StatusBadge status={thread.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className={`card min-h-0 w-full flex-1 flex-col overflow-hidden p-0 lg:flex ${mobileView === "list" ? "hidden" : "flex"}`}>
          {!selected ? (
            <div className="grid h-full min-h-[28rem] place-items-center p-6">
              <EmptyState title="Select a conversation" description="Choose a lead conversation to review messages and compose a reply." />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center gap-3 border-b border-hairline p-4">
                <button
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline text-neutral-600 transition hover:bg-neutral-50 hover:text-ink lg:hidden"
                  onClick={() => setMobileView("list")}
                  aria-label="Back to inbox"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold uppercase text-white">
                  {threadName(selected.thread).slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{threadName(selected.thread)}</p>
                  <p className="truncate text-xs text-neutral-500">{selected.thread.leadId?.email || selected.thread.fromEmail || ""}</p>
                </div>
                <StatusBadge status={selected.thread.status} />
                <button
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1"
                  onClick={() => setLeadDetailsOpen(true)}
                  aria-label="View lead details"
                  title="View lead details"
                >
                  <UserRound size={16} />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-neutral-50 p-5">
                {threadLoading ? (
                  <EmptyState title="Loading conversation..." />
                ) : selected.messages.map((message) => (
                  <MessageBubble key={message._id} message={message} />
                ))}
              </div>

              <div className="shrink-0 border-t border-hairline bg-white p-4">
                <button
                  className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-neutral-500 transition hover:text-ink"
                  onClick={() => setAdvancedOpen((current) => !current)}
                >
                  Advanced options
                  <ChevronDown size={14} className={`transition ${advancedOpen ? "rotate-180" : ""}`} />
                </button>
                {advancedOpen && (
                  <div className="mb-3 grid gap-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="block text-[13px] font-medium text-neutral-700">Subject</span>
                      <input className="mt-1.5" value={reply.subject} onChange={(event) => setReply((current) => ({ ...current, subject: event.target.value }))} placeholder="Subject" />
                    </label>
                    <label className="block">
                      <span className="block text-[13px] font-medium text-neutral-700">Tone</span>
                      <select className="mt-1.5" value={tone} onChange={(event) => setTone(event.target.value)}>
                        {["Professional", "Friendly", "Concise", "Warm"].map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[13px] font-medium text-neutral-700">Reply goal</span>
                      <input className="mt-1.5" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Book a discovery call…" />
                    </label>
                  </div>
                )}
                <textarea rows={3} className="min-h-[3.5rem] resize-none" value={reply.body} onChange={(event) => setReply((current) => ({ ...current, body: event.target.value }))} placeholder="Write a reply…" />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button className="btn-secondary" disabled={generating} onClick={generateReply}><Sparkles size={16} />{generating ? "Generating..." : "AI Generate Reply"}</button>
                  <button className="btn-accent" disabled={sending || !reply.body.trim()} onClick={sendReply}><Send size={16} />{sending ? "Sending..." : "Send"}</button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {leadDetailsOpen && selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30 p-4 backdrop-blur-sm" onClick={() => setLeadDetailsOpen(false)}>
          <div className="h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-pop" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Lead Details</h2>
                <p className="text-sm text-neutral-500">Details for the selected conversation.</p>
              </div>
              <button className="rounded-xl border border-hairline p-2" onClick={() => setLeadDetailsOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {selected.thread.leadId ? (
              <div className="rounded-2xl border border-hairline p-4">
                <Info label="Business" value={selected.thread.leadId?.businessName || selected.thread.leadId?.name} />
                <Info label="Email" value={selected.thread.leadId?.email} />
                <Info label="Phone" value={selected.thread.leadId?.phone} />
                <Info label="Status" value={selected.thread.leadId?.status} />
                <Info label="Campaign" value={selected.thread.campaignId?.name} />
                <Info label="Agent" value={selected.thread.agentId?.agentName} />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-hairline p-5 text-sm text-neutral-500">Lead details not available.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }) {
  const [showQuoted, setShowQuoted] = useState(false);
  const { main, quoted } = splitQuotedText(messageText(message));
  const outbound = message.direction === "outbound";

  return (
    <div className={`flex flex-col ${outbound ? "items-end" : "items-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 sm:max-w-[75%] ${outbound ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-neutral-100 text-neutral-800"}`}>
        <p className="whitespace-pre-wrap break-anywhere">{main || "No message body"}</p>
        {quoted && (
          <div className="mt-2">
            <button
              className={`text-xs font-medium ${outbound ? "text-brand-100 hover:text-white" : "text-brand-700 hover:text-brand-800"}`}
              onClick={() => setShowQuoted((current) => !current)}
            >
              {showQuoted ? "Hide quoted text" : "Show quoted text"}
            </button>
            {showQuoted && (
              <p className={`mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-anywhere rounded-xl p-3 text-xs leading-5 ${outbound ? "bg-white/15 text-brand-50" : "bg-white text-neutral-500"}`}>{quoted}</p>
            )}
          </div>
        )}
      </div>
      <span className="mt-1 px-1 text-[11px] tabular-nums text-neutral-400">{shortTime(message.sentAt || message.receivedAt || message.createdAt)}</span>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="border-t border-hairline py-2 first:border-t-0">
      <p className="text-xs font-semibold uppercase text-neutral-500">{label}</p>
      <p className="break-anywhere text-sm font-semibold text-ink">{value || "Not provided"}</p>
    </div>
  );
}
