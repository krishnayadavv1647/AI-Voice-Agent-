import { ChevronLeft, Download, Loader2, Paperclip, RefreshCw, Reply, ReplyAll, Search, Send, Settings, Sparkles, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageLoader from "../components/PageLoader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api, apiBlob } from "../lib/api.js";

const FOLDERS = [
  { key: "inbox", label: "Inbox" },
  { key: "unread", label: "Unread" },
  { key: "sent", label: "Sent" },
  { key: "drafts", label: "Drafts" },
  { key: "starred", label: "Starred" },
  { key: "important", label: "Important" },
  { key: "spam", label: "Spam" },
  { key: "trash", label: "Trash" },
  { key: "all", label: "All Mail" }
];

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function errorText(err) {
  return err.response?.message || err.message || "Something went wrong.";
}

function messageText(message) {
  return message?.textBody || message?.text || message?.body || String(message?.htmlBody || message?.html || "").replace(/<[^>]+>/g, " ");
}

// Splits a plain-text email into the new content vs. the quoted reply history, so the quoted
// "On … wrote:" / ">"-prefixed block (and any quoted unsubscribe footer) can be collapsed.
function splitQuotedText(text) {
  const lines = String(text || "").split(/\r?\n/);
  let cut = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    const isQuoteLine = /^>/.test(trimmed)
      || /^-{2,}\s*Original Message\s*-{2,}/i.test(trimmed)
      || /^_{5,}$/.test(trimmed)
      || /^On\b.*\bwrote:\s*$/i.test(trimmed)
      // "On … " attribution that wraps onto a following line ending in "wrote:"
      || (/^On\b/.test(trimmed) && i + 1 < lines.length && /wrote:\s*$/i.test(lines[i + 1].trim()));
    if (isQuoteLine) { cut = i; break; }
  }
  if (cut === -1) return { main: text, quoted: "" };
  return {
    main: lines.slice(0, cut).join("\n").trim(),
    quoted: lines.slice(cut).join("\n").trim()
  };
}

// Removes quoted reply blocks from HTML email so the formatted view is also trimmed.
// Runs in the sandboxed-iframe path; DOMParser never executes scripts.
function stripHtmlQuotes(html) {
  try {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll('.gmail_quote, blockquote, [class*="gmail_quote"], .gmail_extra').forEach((el) => el.remove());
    return doc.body.innerHTML || html;
  } catch {
    return html;
  }
}

// True when the HTML is a real formatted email (tables/images/links/etc.) rather than a plain
// message we wrapped in <html><body>…</body></html>. Rich emails render as HTML by default.
function isRichHtml(html) {
  return Boolean(html) && /<(table|div|img|a\s|ul|ol|h[1-6]|center|font|style|p[\s>])/i.test(html);
}

// Wraps the email HTML in a readable document: sane font, responsive images, links open in a new
// tab, no referrer. Quoted reply history is stripped so the rendered email stays trimmed.
function buildEmailSrcDoc(html) {
  const cleaned = stripHtmlQuotes(html);
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><meta name="referrer" content="no-referrer"><style>
    html,body{margin:0;padding:0;}
    body{padding:14px;background:#fff;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;word-break:break-word;overflow-wrap:anywhere;}
    img{max-width:100%;height:auto;border:0;}
    a{color:#2563eb;}
    table{max-width:100%;}
    blockquote{margin:8px 0;padding-left:10px;border-left:3px solid #e5e7eb;color:#6b7280;}
  </style></head><body>${cleaned}</body></html>`;
}

// Renders an HTML email in a sandboxed iframe that auto-sizes to its content.
// sandbox WITHOUT allow-scripts means no email JS ever executes; allow-same-origin only lets the
// parent read the content height, and allow-popups lets links open in a new tab.
function EmailFrame({ html }) {
  const ref = useRef(null);
  const srcDoc = useMemo(() => buildEmailSrcDoc(html), [html]);
  function handleLoad() {
    try {
      const doc = ref.current?.contentDocument;
      if (doc?.body) ref.current.style.height = `${Math.min(doc.body.scrollHeight + 28, 1400)}px`;
    } catch {
      /* cross-origin guard; keep the default height */
    }
  }
  return (
    <iframe
      ref={ref}
      title="Email content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      onLoad={handleLoad}
      style={{ height: 240 }}
      className="w-[min(74vw,640px)] rounded-lg border-0 bg-white"
    />
  );
}

function shortTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if ((now - date) / 86400000 < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function threadName(thread) {
  return thread.leadName || thread.leadId?.businessName || thread.leadId?.contactName || thread.leadId?.name
    || thread.email || thread.leadId?.email || thread.fromEmail || thread.toEmail || "Unknown";
}

function refreshUnreadBadge() {
  window.dispatchEvent(new Event("email-unread-count-changed"));
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EmailInbox() {
  const [searchParams] = useSearchParams();
  const threadParam = searchParams.get("thread") || "";

  const [gmailConnected, setGmailConnected] = useState(true);
  const [folder, setFolder] = useState("inbox");
  const [threads, setThreads] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState({ subject: "", body: "", mode: "reply" });
  const [goal, setGoal] = useState("Book a discovery call if the lead is interested");
  const [tone, setTone] = useState("Professional");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [mobileView, setMobileView] = useState("list");
  const [composeOpen, setComposeOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const selectedIdRef = useRef("");

  const [folderCounts, setFolderCounts] = useState({});

  const localFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || searchMode) return threads;
    return threads.filter((thread) =>
      [threadName(thread), thread.subject, thread.lastMessagePreview, thread.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [threads, search, searchMode]);

  async function loadConnection() {
    try {
      const result = await api("/email-integrations/status");
      setGmailConnected(Boolean(result.integration?.gmail?.connected));
    } catch {
      setGmailConnected(false);
    }
  }

  async function loadFolderCounts() {
    try {
      setFolderCounts(await api("/email/folder-counts"));
    } catch {
      /* counts are non-critical; leave as-is */
    }
  }

  async function loadThreads(nextFolder = folder, { pageNum = 1, append = false, keepSelected } = {}) {
    if (!append) setLoading(true);
    try {
      const params = new URLSearchParams({ folder: nextFolder, page: String(pageNum), limit: "25" });
      const result = await api(`/email/threads?${params.toString()}`);
      const list = Array.isArray(result) ? result : result.threads || [];
      setHasMore(Array.isArray(result) ? false : Boolean(result.hasMore));
      setPage(pageNum);
      const merged = append ? [...threads, ...list] : list;
      setThreads(merged);

      if (!append) {
        const id = keepSelected || threadParam || merged[0]?._id || "";
        setSelectedId(id);
        selectedIdRef.current = id;
        if (id) await loadThread(id);
        else setSelected(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadThread(id) {
    setThreadLoading(true);
    try {
      const detail = await api(`/email/threads/${id}`);
      const readResult = await api(`/email/threads/${id}/read`, { method: "POST" });
      if (readResult.markedCount) refreshUnreadBadge();
      const messages = detail.messages || [];
      const latestInbound = [...messages].reverse().find((m) => m.direction === "inbound");
      const replyAllPossible = Boolean(latestInbound && ((latestInbound.cc?.length || 0) > 0 || (latestInbound.to?.length || 0) > 1));
      setSelected({ ...detail, messages, replyAllPossible });
      setReply({
        subject: detail.thread.subject?.toLowerCase().startsWith("re:") ? detail.thread.subject : `Re: ${detail.thread.subject || "Following up"}`,
        body: "",
        mode: "reply"
      });
    } finally {
      setThreadLoading(false);
    }
  }

  async function syncInbox() {
    if (syncing) return;
    setSyncing(true);
    setError("");
    try {
      await api("/email-integrations/sync-now", { method: "POST" });
      refreshUnreadBadge();
      await loadThreads(folder, { pageNum: 1, keepSelected: selectedIdRef.current });
      loadFolderCounts();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadConnection();
    loadFolderCounts();
  }, []);

  useEffect(() => {
    setSearchMode(false);
    loadThreads(folder, { pageNum: 1, keepSelected: threadParam }).catch((err) => {
      setLoading(false);
      setError(errorText(err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  async function selectThread(id) {
    setSelectedId(id);
    selectedIdRef.current = id;
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

  async function runGmailSearch() {
    const q = search.trim();
    if (!q) {
      setSearchMode(false);
      return loadThreads(folder, { pageNum: 1 });
    }
    setLoading(true);
    setError("");
    try {
      const result = await api(`/email/gmail/search?q=${encodeURIComponent(q)}`);
      setSearchMode(true);
      setHasMore(false);
      setThreads(result.threads || []);
      const id = result.threads?.[0]?._id || "";
      setSelectedId(id);
      selectedIdRef.current = id;
      if (id) await loadThread(id);
      else setSelected(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  async function generateReply() {
    if (!selectedId) return;
    setGenerating(true);
    setNotice("");
    setError("");
    try {
      const draft = await api(`/email/threads/${selectedId}/generate-reply`, { method: "POST", body: { goal, tone } });
      setReply((current) => ({ ...current, subject: draft.subject || current.subject, body: draft.body || "" }));
      setNotice("AI draft generated. Review it before sending.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setGenerating(false);
    }
  }

  async function sendReply(mode) {
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
        body: { subject: reply.subject, body: reply.body, mode: mode || reply.mode }
      });
      setNotice(mode === "reply_all" ? "Reply All sent." : "Reply sent.");
      setReply((current) => ({ ...current, body: "" }));
      await loadThread(selectedId);
      await loadThreads(folder, { pageNum: 1, keepSelected: selectedId });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  if (!gmailConnected) {
    return (
      <div className="page-stack">
        <div className="card p-8 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-neutral-100"><Send size={22} className="text-neutral-600" /></div>
          <h1 className="text-lg font-semibold text-ink">Connect Gmail to use the inbox</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">View, send, reply to, and manage your emails inside the app once your Gmail account is connected.</p>
          <Link to="/settings/email" className="btn-primary mx-auto mt-4">Go to Email Settings</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="email-inbox-page">
      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="email-inbox-topbar">
        <p>Inbox</p>
        <div className="email-topbar-actions">
          <div className="email-top-folders">
          {FOLDERS.map((item) => (
            <button
              key={item.key}
              className={`rounded-full px-3 py-1 text-[13px] font-medium transition ${folder === item.key ? "bg-ink text-white" : "border border-hairline bg-white text-neutral-600 hover:bg-neutral-50 hover:text-ink"}`}
              onClick={() => setFolder(item.key)}
            >
              {item.label}
            </button>
          ))}
          </div>
          <button className="email-compose-button" onClick={() => setComposeOpen(true)}><Send size={14} />Compose</button>
          <button className="email-top-icon" aria-label="Email settings" title="Email settings"><Settings size={17} /></button>
        </div>
      </div>

      <div className="email-inbox-workspace" data-view={selected && mobileView === "thread" ? "thread" : "list"}>
        <aside className="email-folder-panel">
          <div className="email-panel-heading">
            <h1>Inbox</h1>
            <button
              className="email-icon-button"
              disabled={syncing}
              onClick={syncInbox}
              aria-label="Sync"
              title="Sync Gmail"
            >
              <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="email-search-box">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") runGmailSearch(); }}
              placeholder="Search Gmail (press Enter)"
            />
            {loading || syncing ? <Loader2 size={14} className="animate-spin" /> : null}
          </div>

          {searchMode && (
            <button className="email-clear-search" onClick={() => { setSearch(""); setSearchMode(false); loadThreads(folder, { pageNum: 1 }); }}>
              Clear search
            </button>
          )}

          <nav className="email-folder-list">
            {FOLDERS.map((item, index) => {
              const count = folderCounts[item.key] || (item.key === folder ? threads.length : 0);
              return (
                <button
                  key={item.key}
                  className={`email-folder-item ${folder === item.key ? "is-active" : ""}`}
                  onClick={() => setFolder(item.key)}
                >
                  <span className={`email-folder-dot email-folder-dot-${index % 3}`} />
                  <span>{item.label}</span>
                  {count > 0 && <strong>{count}</strong>}
                </button>
              );
            })}
          </nav>
        </aside>

        <aside className="email-list-panel">
          <div className="email-list-header">
            <h2>Email List</h2>
          </div>
          <div className="email-list-scroll">
            {loading ? (
              <PageLoader label="Loading" />
            ) : !localFiltered.length ? (
              <div className="p-4"><EmptyState title="No emails here" description={searchMode ? "No Gmail messages matched your search." : "This folder is empty."} /></div>
            ) : (
              <>
                <div className="divide-y divide-hairline">
                  {localFiltered.map((thread) => {
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
                          <p className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-semibold text-ink" : "font-medium text-neutral-700"}`}>{threadName(thread)}</p>
                          {thread.hasAttachments && <Paperclip size={13} className="shrink-0 text-neutral-400" />}
                          <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">{shortTime(thread.lastMessageAt)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <p className={`min-w-0 flex-1 truncate text-[13px] ${unread ? "text-neutral-600" : "text-neutral-500"}`}>
                            {thread.subject ? <span className="text-neutral-500">{thread.subject} · </span> : null}
                            {thread.lastMessagePreview || thread.snippet || "No preview"}
                          </p>
                          {thread.messagesCount > 1 && <span className="shrink-0 text-[11px] text-neutral-400">{thread.messagesCount}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {hasMore && !searchMode && (
                  <div className="p-3">
                    <button className="btn-secondary w-full" disabled={loading} onClick={() => loadThreads(folder, { pageNum: page + 1, append: true })}>Load More</button>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        <section className="email-message-panel">
          {!selected ? (
            <div className="grid h-full min-h-[28rem] place-items-center p-6">
              <EmptyState title="Select a conversation" description="Choose an email to read the full thread and reply." />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center gap-3 border-b border-hairline p-4">
                <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline text-neutral-600 transition hover:bg-neutral-50 lg:hidden" onClick={() => setMobileView("list")} aria-label="Back"><ChevronLeft size={18} /></button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{selected.thread.subject || "(no subject)"}</p>
                  <p className="truncate text-xs text-neutral-500">{threadName(selected.thread)} · {selected.thread.toEmail || selected.thread.fromEmail}</p>
                </div>
                <StatusBadge status={selected.thread.status} />
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-neutral-50 p-5">
                {threadLoading ? <EmptyState title="Loading conversation…" /> : selected.messages.map((message) => (
                  <MessageBubble key={message._id} message={message} />
                ))}
              </div>

              <div className="shrink-0 border-t border-hairline bg-white p-4">
                <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input className="text-sm" value={reply.subject} onChange={(event) => setReply((c) => ({ ...c, subject: event.target.value }))} placeholder="Subject" />
                  <select className="text-sm" value={tone} onChange={(event) => setTone(event.target.value)}>
                    {["Professional", "Friendly", "Concise", "Warm"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <button className="btn-secondary" disabled={generating} onClick={generateReply}><Sparkles size={16} />{generating ? "…" : "AI Draft"}</button>
                </div>
                <textarea rows={3} className="min-h-[3.5rem] resize-none" value={reply.body} onChange={(event) => setReply((c) => ({ ...c, body: event.target.value }))} placeholder="Write a reply…" />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button className="btn-secondary" disabled={sending || !reply.body.trim()} onClick={() => sendReply("reply")}><Reply size={16} />{sending ? "Sending…" : "Reply"}</button>
                  {selected.replyAllPossible && (
                    <button className="btn-secondary" disabled={sending || !reply.body.trim()} onClick={() => sendReply("reply_all")}><ReplyAll size={16} />Reply All</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {composeOpen && <ComposeModal onClose={() => setComposeOpen(false)} onSent={() => { setComposeOpen(false); setNotice("Email sent."); loadThreads(folder, { pageNum: 1 }); }} />}
    </div>
  );
}

function MessageBubble({ message }) {
  const [showQuoted, setShowQuoted] = useState(false);
  // null = use the smart default (formatted for rich HTML, plain text otherwise).
  const [formattedOverride, setFormattedOverride] = useState(null);
  const outbound = message.direction === "outbound";
  const html = message.htmlBody || message.html || "";
  const text = messageText(message);
  const { main, quoted } = splitQuotedText(text);
  const showFormatted = Boolean(html) && (formattedOverride === null ? isRichHtml(html) : formattedOverride);
  const senderName = message.from?.[0]?.name || "";
  const senderEmail = message.fromEmail || message.from?.[0]?.email || "";
  const dateLabel = shortTime(message.sentAt || message.receivedAt || message.gmailInternalDate || message.createdAt);
  const attachments = (message.attachments || []).filter((att) => att.filename && !att.inline);

  async function downloadAttachment(att) {
    try {
      const { blob } = await apiBlob(`/email/messages/${message._id}/attachments/${att.attachmentId}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = att.filename || "attachment";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* surfaced via disabled state; keep silent */
    }
  }

  return (
    <div className={`flex flex-col ${outbound ? "items-end" : "items-start"}`}>
      <div className={`w-full max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[86%] ${outbound ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md border border-hairline bg-white text-neutral-800"}`}>
        <div className={`mb-2 flex items-center gap-2 border-b pb-2 text-[11px] ${outbound ? "border-white/20" : "border-hairline"}`}>
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold uppercase ${outbound ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-600"}`}>
            {(senderName || senderEmail || "?").slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {senderName ? <span className="font-semibold">{senderName} </span> : null}
            <span className="opacity-70">{senderName ? `<${senderEmail}>` : senderEmail}</span>
          </span>
          {message.isStarred && <Star size={12} className="shrink-0 fill-current" />}
          <span className="shrink-0 tabular-nums opacity-60">{dateLabel}</span>
        </div>
        {showFormatted ? (
          <EmailFrame html={html} />
        ) : (
          <>
            <p className="whitespace-pre-wrap break-anywhere">{main || text || "No message body"}</p>
            {quoted && (
              <>
                <button
                  className={`mt-1 inline-flex items-center rounded px-1.5 text-xs font-semibold leading-5 ${outbound ? "bg-white/20 text-brand-50 hover:bg-white/30" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"}`}
                  onClick={() => setShowQuoted((v) => !v)}
                  title={showQuoted ? "Hide quoted text" : "Show quoted text"}
                >
                  •••
                </button>
                {showQuoted && (
                  <p className={`mt-2 whitespace-pre-wrap break-anywhere border-l-2 pl-3 text-xs opacity-70 ${outbound ? "border-white/30" : "border-hairline"}`}>{quoted}</p>
                )}
              </>
            )}
          </>
        )}
        {html && (
          <button className={`mt-2 block text-xs font-medium ${outbound ? "text-brand-100 hover:text-white" : "text-brand-700 hover:text-brand-800"}`} onClick={() => setFormattedOverride(!showFormatted)}>
            {showFormatted ? "Show plain text" : "Show formatted email"}
          </button>
        )}
        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachments.map((att) => (
              <button
                key={att.attachmentId}
                onClick={() => downloadAttachment(att)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${outbound ? "border-white/30 text-brand-50 hover:bg-white/10" : "border-hairline text-neutral-700 hover:bg-neutral-50"}`}
                title={`Download ${att.filename}`}
              >
                <Download size={12} />{att.filename}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ComposeModal({ onClose, onSent }) {
  const [form, setForm] = useState({ to: "", cc: "", bcc: "", subject: "", body: "" });
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showCc, setShowCc] = useState(false);

  function splitEmails(value) {
    return String(value || "").split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean);
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    const total = attachments.reduce((sum, a) => sum + a.size, 0) + files.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_ATTACHMENT_BYTES) {
      setError("Attachments exceed the 20MB limit.");
      return;
    }
    const encoded = await Promise.all(files.map(async (file) => ({
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      contentBase64: await readFileAsBase64(file)
    })));
    setAttachments((current) => [...current, ...encoded]);
  }

  async function send() {
    const to = splitEmails(form.to);
    if (!to.length) { setError("Add at least one recipient."); return; }
    setSending(true);
    setError("");
    try {
      await api("/email/send", {
        method: "POST",
        body: {
          to,
          cc: splitEmails(form.cc),
          bcc: splitEmails(form.bcc),
          subject: form.subject,
          text: form.body,
          attachments: attachments.map(({ filename, mimeType, contentBase64 }) => ({ filename, mimeType, contentBase64 }))
        }
      });
      onSent();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <h2 className="text-base font-semibold text-ink">New Email</h2>
          <button className="rounded-lg border border-hairline p-1.5 text-neutral-500 hover:bg-neutral-50" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">{error}</div>}
          <label className="field-label">To<input value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} placeholder="customer@example.com, another@example.com" /></label>
          {!showCc ? (
            <button className="text-[13px] font-medium text-brand-700 hover:text-brand-800" onClick={() => setShowCc(true)}>Add Cc / Bcc</button>
          ) : (
            <>
              <label className="field-label">Cc<input value={form.cc} onChange={(event) => setForm({ ...form, cc: event.target.value })} /></label>
              <label className="field-label">Bcc<input value={form.bcc} onChange={(event) => setForm({ ...form, bcc: event.target.value })} /></label>
            </>
          )}
          <label className="field-label">Subject<input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label>
          <label className="field-label">Message<textarea rows={9} className="min-h-[10rem] leading-6" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Write your email…" /></label>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((att, index) => (
                <span key={index} className="inline-flex items-center gap-1 rounded-lg border border-hairline px-2 py-1 text-xs text-neutral-700">
                  <Paperclip size={12} />{att.filename}
                  <button onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))} className="text-neutral-400 hover:text-rose-600"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-hairline p-4">
          <label className="btn-secondary cursor-pointer">
            <Paperclip size={16} />Attach
            <input type="file" multiple className="hidden" onChange={(event) => addFiles(event.target.files)} />
          </label>
          <button className="btn-accent" disabled={sending} onClick={send}><Send size={16} />{sending ? "Sending…" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}
