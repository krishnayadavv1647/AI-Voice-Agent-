import { CheckCircle, ChevronLeft, Copy, Pause, Phone, PhoneOutgoing, Play, RotateCcw, Square, Voicemail } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import DropdownMenu, { DropdownItem } from "../components/ui/DropdownMenu.jsx";
import { api } from "../lib/api.js";

const PENDING_STATUSES = ["queued", "scheduled", "calling"];

function fmt(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function truncateId(value) {
  if (!value) return "";
  return value.length > 12 ? `${value.slice(0, 10)}…` : value;
}

function copy(value) {
  if (value && navigator.clipboard) navigator.clipboard.writeText(value).catch(() => {});
}

function CopyButton({ value }) {
  if (!value) return null;
  return (
    <button className="outbound-copy-btn" onClick={() => copy(value)} aria-label="Copy" title="Copy" type="button">
      <Copy size={14} />
    </button>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="outbound-stat-card">
      <div className="outbound-stat-icon">
        <Icon size={18} />
      </div>
      <div>
        <p className="outbound-stat-label">{label}</p>
        <p className="outbound-stat-value">{value}</p>
      </div>
    </div>
  );
}

export default function OutboundCampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState("");

  const { data: campaign } = useQuery({
    queryKey: ["outbound-campaign", id],
    queryFn: () => api(`/campaigns/${id}`),
    refetchInterval: (query) => (["running", "scheduled"].includes(query.state.data?.status) ? 5000 : false)
  });

  const isActive = ["running", "scheduled"].includes(campaign?.status);

  const { data: recipients = [] } = useQuery({
    queryKey: ["outbound-recipients", id],
    queryFn: () => api(`/campaigns/${id}/recipients`),
    refetchInterval: isActive ? 5000 : false
  });

  const stats = campaign?.stats || {};
  const agentName = campaign?.agentId?.agentName || "-";
  // Phone number is client-side only (no schema field). Prefer the number selected on the create
  // screen, then the agent's caller id, else fall back to a dash.
  const fromNumber = location.state?.phoneNumber || campaign?.agentId?.callerIdNumber || "-";

  async function runAction(type) {
    if (type === "cancel" && !confirm("Cancel this campaign?")) return;
    setPendingAction(type);
    try {
      await api(`/campaigns/${id}/${type}`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["outbound-campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["outbound-recipients", id] });
      queryClient.invalidateQueries({ queryKey: ["outbound-campaigns"] });
    } catch {
      /* surfaced via re-render; errors here are non-fatal to the view */
    } finally {
      setPendingAction("");
    }
  }

  const status = campaign?.status;
  const busy = Boolean(pendingAction);

  return (
    <div className="outbound-page">
      <div className="outbound-topbar">
        <div className="outbound-topbar-lead">
          <button className="outbound-back-btn" onClick={() => navigate("/outbound")} aria-label="Back to Outbound" type="button">
            <ChevronLeft size={18} />
          </button>
          <h1 className="outbound-topbar-title">Outbound Calls</h1>
        </div>
        <div className="outbound-topbar-actions">
          {/* Campaign controls preserved from the old Campaigns screen (reference hides them in a menu). */}
          <DropdownMenu label="Campaign actions">
            {({ close }) => (
              <>
                <DropdownItem
                  icon={Play}
                  disabled={busy || !["draft", "paused", "scheduled"].includes(status)}
                  onClick={() => { close(); runAction("start"); }}
                >
                  Start
                </DropdownItem>
                <DropdownItem
                  icon={Pause}
                  disabled={busy || !["scheduled", "running"].includes(status)}
                  onClick={() => { close(); runAction("pause"); }}
                >
                  Pause
                </DropdownItem>
                <DropdownItem
                  icon={Play}
                  disabled={busy || status !== "paused"}
                  onClick={() => { close(); runAction("resume"); }}
                >
                  Resume
                </DropdownItem>
                <DropdownItem
                  icon={RotateCcw}
                  disabled={busy}
                  onClick={() => { close(); runAction("retry-failed"); }}
                >
                  Retry Failed
                </DropdownItem>
                <DropdownItem
                  icon={Square}
                  danger
                  disabled={busy || ["completed", "cancelled"].includes(status)}
                  onClick={() => { close(); runAction("cancel"); }}
                >
                  Cancel
                </DropdownItem>
              </>
            )}
          </DropdownMenu>
        </div>
      </div>

      {/* Summary block */}
      <div className="outbound-summary">
        <div className="outbound-summary-row">
          <h2 className="outbound-summary-title">{campaign?.name || "—"}</h2>
          <CopyButton value={campaign?.name} />
        </div>
        <div className="outbound-summary-row">
          <span className="outbound-summary-sub">{agentName}</span>
          {campaign?.agentId?.agentName && <CopyButton value={agentName} />}
        </div>
        <div className="outbound-summary-row">
          <span className="outbound-summary-sub">{fromNumber}</span>
          {fromNumber !== "-" && <CopyButton value={fromNumber} />}
        </div>
      </div>

      {/* Stat cards */}
      <div className="outbound-stat-grid">
        <StatCard icon={Phone} label="Total Calls" value={stats.totalRecipients || 0} />
        <StatCard icon={CheckCircle} label="Ended Calls" value={stats.completed || 0} />
        <StatCard icon={PhoneOutgoing} label="Picked Up Calls" value={stats.answered || 0} />
        {/* TODO(outbound): no voicemail metric on CampaignRecipient schema. */}
        <StatCard icon={Voicemail} label="Voicemail Calls" value={0} />
      </div>

      {/* Call Results */}
      <h2 className="outbound-results-title">Call Results</h2>
      <div className="outbound-table-wrap">
        <table className="outbound-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>
                {/* TODO(outbound): bulk actions — selection is cosmetic for now. */}
                <input className="outbound-check" type="checkbox" aria-label="Select all" onClick={(event) => event.stopPropagation()} />
              </th>
              <th><span className="outbound-th-inner">Call ID</span></th>
              <th><span className="outbound-th-inner">Ended Reason</span></th>
              <th><span className="outbound-th-inner">Customer Phone</span></th>
              <th><span className="outbound-th-inner">Success Evaluation</span></th>
              <th><span className="outbound-th-inner">Duration</span></th>
              <th><span className="outbound-th-inner">Start Time</span></th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((recipient) => {
              const pending = PENDING_STATUSES.includes(recipient.status);
              return (
                <tr key={recipient._id}>
                  <td>
                    <input className="outbound-check" type="checkbox" aria-label="Select row" />
                  </td>
                  <td>
                    {recipient.providerCallId ? (
                      <span className="outbound-callid-pill">
                        {truncateId(recipient.providerCallId)}
                        <button className="outbound-callid-copy" onClick={() => copy(recipient.providerCallId)} aria-label="Copy call id" type="button">
                          <Copy size={12} />
                        </button>
                      </span>
                    ) : (
                      <span className="outbound-muted-cell">-</span>
                    )}
                  </td>
                  <td>
                    {pending ? (
                      <span className="outbound-spinner" aria-label="In progress" />
                    ) : (
                      <div className="outbound-reason-cell">
                        <span>{recipient.lastOutcome || <span className="outbound-muted-cell">-</span>}</span>
                        {recipient.lastError && (
                          <span className="outbound-reason-error" title={recipient.lastError}>{recipient.lastError}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>{recipient.phone}</td>
                  {/* TODO(outbound): no success-evaluation field on CampaignRecipient. */}
                  <td className="outbound-muted-cell">-</td>
                  {/* TODO(outbound): duration not populated on lastCallLogId (only status/createdAt are selected). */}
                  <td className="outbound-muted-cell">-</td>
                  <td>{fmt(recipient.scheduledAt || recipient.updatedAt)}</td>
                </tr>
              );
            })}
            {!recipients.length && (
              <tr>
                <td className="outbound-muted-cell" colSpan={7} style={{ textAlign: "center" }}>No calls yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
