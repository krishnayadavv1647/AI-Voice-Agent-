import { Download, FileText, MoreVertical, PhoneCall, PlayCircle, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PageLoader from "../components/PageLoader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api, apiBlob } from "../lib/api.js";

function formatDuration(call) {
  if (typeof call.durationSeconds === "number") {
    const minutes = Math.floor(call.durationSeconds / 60);
    const seconds = call.durationSeconds % 60;
    return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }
  return call.duration || "Pending";
}

function errorText(err) {
  return err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
}

function callPhone(call) {
  return call.callerNumber || call.callingNumber || call.leadData?.phone || call.leadData?.phone_number || call.leadData?.phoneNumber || "";
}

export default function CallLogs() {
  const queryClient = useQueryClient();
  const { data: calls = [], error: queryError, isPending } = useQuery({
    queryKey: ["calls"],
    queryFn: () => api("/calls")
  });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [actingId, setActingId] = useState("");
  const [openOptionsId, setOpenOptionsId] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const error = actionError || queryError?.message || "";

  const filteredCalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return calls;
    return calls.filter((call) =>
      [callPhone(call), call.callingNumber, call.agentId?.agentName, call.status, call.outcome, call.normalizedStatus]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [calls, search]);

  function reloadCalls() {
    queryClient.invalidateQueries({ queryKey: ["calls"] });
  }

  async function remove(id) {
    if (!confirm("Delete this call log?")) return;
    await api(`/calls/${id}`, { method: "DELETE" });
    setOpenOptionsId("");
    reloadCalls();
  }

  async function sync(id) {
    setActingId(id);
    setNotice("");
    setActionError("");
    try {
      await api(`/calls/${id}/sync`, { method: "POST" });
      setNotice("Call synced.");
      setOpenOptionsId("");
      reloadCalls();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setActingId("");
    }
  }

  async function retry(id) {
    setActingId(id);
    setNotice("");
    setActionError("");
    try {
      await api(`/calls/${id}/retry`, { method: "POST" });
      setNotice("Retry call started.");
      setOpenOptionsId("");
      reloadCalls();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setActingId("");
    }
  }

  async function downloadRecording(call) {
    setActingId(call._id);
    setNotice("");
    setActionError("");
    try {
      const { blob, contentType } = await apiBlob(`/calls/${call._id}/recording`);
      const extension = contentType.includes("wav") ? "wav" : contentType.includes("ogg") ? "ogg" : "mp3";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `call-recording-${call._id}.${extension}`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Recording download started.");
      setOpenOptionsId("");
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setActingId("");
    }
  }

  return (
    <div className="page-stack">
      <PageHeader title="Call Logs" description="Review call data, recordings, transcripts, summaries, and lead extraction status." />
      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {!!calls.length && (
        <div className="relative mb-4">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            className="pl-9"
            style={{ height: 40, minHeight: 40 }}
            placeholder="Search by phone, agent, status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      {isPending ? (
        <PageLoader label="Loading call logs" />
      ) : !calls.length ? (
        <EmptyState title="No calls yet. Start a test call to see call logs." description="Completed calls will sync duration, status, transcript URL, and recording URL." />
      ) : !filteredCalls.length ? (
        <p className="py-8 text-center text-sm text-neutral-500">No call logs found for your search.</p>
      ) : (
        <>
          <div className="mobile-card-list">
            {filteredCalls.map((call) => (
              <CallCard
                key={call._id}
                call={call}
                setSelected={setSelected}
                sync={sync}
                retry={retry}
                remove={remove}
                downloadRecording={downloadRecording}
                actingId={actingId}
                openOptionsId={openOptionsId}
                setOpenOptionsId={setOpenOptionsId}
              />
            ))}
          </div>
          <div className="desktop-table card overflow-hidden p-0">
            <div className="table-wrap">
              <table className="table w-full min-w-[900px]">
                <thead><tr><th>Date</th><th>Caller Number</th><th>Agent</th><th>Status</th><th>Retry</th><th>Duration</th><th>Lead</th><th className="w-16 text-right">Options</th></tr></thead>
                <tbody>
                  {filteredCalls.map((call) => (
                    <tr key={call._id}>
                      <td>{new Date(call.createdAt).toLocaleString()}</td>
                      <td className="break-anywhere">{callPhone(call) || "Unknown"}</td>
                      <td>{call.agentId?.agentName || "Agent"}</td>
                      <td><StatusBadge status={call.status || "pending"} /></td>
                      <td>{call.retryScheduled ? "Scheduled" : call.retryEligible ? "Eligible" : "-"}</td>
                      <td>{formatDuration(call)}</td>
                      <td>{call.leadCaptured ? "Yes" : "No"}</td>
                      <td className="text-right">
                        <CallOptionsMenu
                          call={call}
                          isOpen={openOptionsId === `desktop:${call._id}`}
                          setOpen={(open) => setOpenOptionsId(open ? `desktop:${call._id}` : "")}
                          setSelected={setSelected}
                          sync={sync}
                          retry={retry}
                          remove={remove}
                          downloadRecording={downloadRecording}
                          actingId={actingId}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selected && <CallModal call={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CallCard({ call, setSelected, sync, retry, remove, downloadRecording, actingId, openOptionsId, setOpenOptionsId }) {
  return (
    <article className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-anywhere font-semibold text-ink">{callPhone(call) || "Unknown caller"}</p>
          <p className="text-sm text-neutral-500">{new Date(call.createdAt).toLocaleString()}</p>
        </div>
        <StatusBadge status={call.status || "pending"} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Info label="Duration" value={formatDuration(call)} />
        <Info label="Lead" value={call.leadCaptured ? "Yes" : "No"} />
        <Info label="Agent" value={call.agentId?.agentName || "Agent"} />
      </div>
      <div className="mt-4 flex justify-end">
        <CallOptionsMenu
          call={call}
          isOpen={openOptionsId === `mobile:${call._id}`}
          setOpen={(open) => setOpenOptionsId(open ? `mobile:${call._id}` : "")}
          setSelected={setSelected}
          sync={sync}
          retry={retry}
          remove={remove}
          downloadRecording={downloadRecording}
          actingId={actingId}
        />
      </div>
    </article>
  );
}

function CallOptionsMenu({ call, isOpen, setOpen, setSelected, sync, retry, remove, downloadRecording, actingId }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 420 });
  const hasRecording = Boolean(call.recordingUrl);
  const canSync = Boolean(call.providerCallId);
  const canCallAgain = Boolean(call.agentId && callPhone(call));

  function updatePosition() {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const menuHeight = menuRef.current?.offsetHeight || (hasRecording ? 430 : 330);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const opensUp = spaceBelow < menuHeight && rect.top > spaceBelow;
    const maxHeight = Math.max(220, opensUp ? rect.top - 16 : spaceBelow);
    const top = opensUp ? Math.max(12, rect.top - Math.min(menuHeight, maxHeight) - 8) : rect.bottom + 8;
    const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);

    setPosition({ top, left, maxHeight });
  }

  useEffect(() => {
    if (!isOpen) return undefined;

    updatePosition();

    function onPointerDown(event) {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, call._id, hasRecording]);

  function run(action) {
    setOpen(false);
    action();
  }

  const menu = (
    <div
      ref={menuRef}
      className="call-options-menu fixed z-[9999] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-hairline bg-white p-2 text-left shadow-pop"
      style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
      role="menu"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="px-2 pb-2 pt-1">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Recording</p>
        {hasRecording ? (
          <div className="space-y-2">
            <audio className="w-full" controls src={call.recordingUrl} />
            <MenuButton icon={PlayCircle} onClick={() => run(() => setSelected(call))}>
              Play Recording
            </MenuButton>
            <MenuButton icon={Download} disabled={actingId === call._id} onClick={() => run(() => downloadRecording(call))}>
              Download Recording
            </MenuButton>
          </div>
        ) : (
          <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-500">No recording available</p>
        )}
      </div>

      <div className="mt-1 border-t border-hairline px-2 py-2">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Actions</p>
        <MenuButton icon={FileText} onClick={() => run(() => setSelected(call))}>
          View Transcript / Details
        </MenuButton>
        <MenuButton icon={RefreshCw} disabled={actingId === call._id || !canSync} title={!canSync ? "Provider call ID is missing for this call log." : ""} onClick={() => run(() => sync(call._id))}>
          Retry Sync
        </MenuButton>
        <MenuButton icon={PhoneCall} disabled={actingId === call._id || !canCallAgain} title={!canCallAgain ? "This call log needs an agent and phone number before calling again." : ""} onClick={() => run(() => retry(call._id))}>
          Call Again
        </MenuButton>
      </div>

      <div className="mt-1 border-t border-hairline px-2 pt-2">
        <MenuButton danger icon={Trash2} onClick={() => run(() => remove(call._id))}>
          Delete
        </MenuButton>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="inline-grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-white text-neutral-600 transition hover:bg-neutral-50 hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open call options"
        title="Open call options"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isOpen) updatePosition();
          setOpen(!isOpen);
        }}
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </>
  );
}

function MenuButton({ children, icon: Icon, danger = false, disabled = false, onClick, title = "" }) {
  return (
    <button
      type="button"
      className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold ${
        danger ? "text-rose-700 hover:bg-rose-50" : "text-neutral-700 hover:bg-neutral-50 hover:text-ink"
      } disabled:cursor-not-allowed disabled:opacity-50`}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) onClick?.(event);
      }}
      role="menuitem"
      title={title}
    >
      <Icon size={16} className="shrink-0" />
      <span>{children}</span>
    </button>
  );
}

function CallModal({ call, onClose }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="modal-panel rounded-2xl bg-white p-4 shadow-pop sm:max-w-4xl sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">Call Detail</h2>
            <p className="text-sm text-neutral-500">Transcript, recording, and extracted lead data.</p>
          </div>
          <button className="rounded-xl border border-hairline p-2" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Info label="Status" value={call.status} />
          <Info label="Retry" value={call.retryScheduled ? "Scheduled" : call.retryEligible ? "Eligible" : "Not eligible"} />
          <Info label="Duration" value={formatDuration(call)} />
          <Info label="Start Time" value={call.startedAt ? new Date(call.startedAt).toLocaleString() : ""} />
          <Info label="End Time" value={call.endedAt ? new Date(call.endedAt).toLocaleString() : ""} />
          <Info label="Caller Number" value={callPhone(call)} />
          <Info label="Calling Number" value={call.callingNumber} />
        </div>
        {call.recordingUrl && <div className="mt-5 rounded-2xl border border-hairline p-4"><p className="mb-2 text-sm font-semibold">Recording</p><audio className="w-full" controls src={call.recordingUrl} /></div>}
        <Block title="Summary" value={call.summary || "No summary from the provider"} />
        <Block title="Transcript" value={call.transcript || "No transcript"} />
        <Block title="Extracted Lead Data" value={call.leadData ? JSON.stringify(call.leadData, null, 2) : "No extracted lead data returned by the provider."} pre />
        <details className="mt-5 rounded-2xl border border-hairline p-4">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-700">Raw debug data</summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-ink p-4 text-xs text-slate-100">{JSON.stringify(call.rawRunDetails || call.providerPayload || call.rawWebhookPayload || {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return <div className="min-w-0 rounded-2xl bg-neutral-50 p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{label}</p><p className="break-anywhere text-sm font-semibold text-ink">{value || "Not provided"}</p></div>;
}

function Block({ title, value, pre = false }) {
  return (
    <div className="mt-5 rounded-2xl border border-hairline p-4">
      <p className="mb-2 text-sm font-semibold text-ink">{title}</p>
      {pre ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-neutral-50 p-3 text-sm text-neutral-700">{value}</pre> : <p className="max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-6 text-neutral-700">{value}</p>}
    </div>
  );
}
