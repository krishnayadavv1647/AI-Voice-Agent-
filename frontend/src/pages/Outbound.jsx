import { ArrowUp, CheckCircle, ChevronRight, Circle, Info, Phone, PhoneOutgoing, Plus, Tag, Voicemail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

// TODO(outbound): Composer entry point — no Composer feature exists in the app yet, so the
// "Composer" button from the reference screenshots is intentionally omitted here.

function createdOn(value) {
  if (!value) return "-";
  return `Created on ${new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function ColumnHead({ icon: Icon, label, extra, className = "" }) {
  return (
    <th className={className}>
      <span className="outbound-th-inner">
        <Icon size={14} />
        {label}
        {extra}
      </span>
    </th>
  );
}

export default function Outbound() {
  const navigate = useNavigate();
  const { data: campaigns = [], isLoading } = useQuery({ queryKey: ["outbound-campaigns"], queryFn: () => api("/campaigns") });
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const cmp = String(a.name || "").localeCompare(String(b.name || ""));
      return sortAsc ? cmp : -cmp;
    });
  }, [campaigns, sortAsc]);

  const header = (
    <div className="outbound-topbar">
      <div className="outbound-topbar-lead">
        <h1 className="outbound-topbar-title">Outbound</h1>
      </div>
      <div className="outbound-topbar-actions">
        <button className="btn-primary" onClick={() => navigate("/outbound/new")}>
          <Plus size={16} />
          Create Campaign
        </button>
      </div>
    </div>
  );

  if (!isLoading && !campaigns.length) {
    return (
      <div className="outbound-page">
        {header}
        <div className="outbound-empty">
          <div className="outbound-empty-icon">
            <PhoneOutgoing size={22} />
          </div>
          <h2 className="outbound-empty-title">No campaigns yet</h2>
          <p className="outbound-empty-sub">Create your first campaign to start reaching out to customers</p>
          <button className="btn-primary" onClick={() => navigate("/outbound/new")}>
            <Plus size={16} />
            Create Campaign
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="outbound-page">
      {header}
      <h2 className="outbound-section-title">Campaigns</h2>
      <div className="outbound-table-wrap">
        <table className="outbound-table">
          <thead>
            <tr>
              <th>
                <button className="outbound-th-inner outbound-th-sort" onClick={() => setSortAsc((value) => !value)} type="button">
                  <Tag size={14} />
                  Campaign Name
                  <ChevronRight size={13} style={{ transform: sortAsc ? "rotate(90deg)" : "rotate(-90deg)" }} />
                </button>
              </th>
              <ColumnHead icon={Circle} label="Status" />
              <ColumnHead icon={Phone} label="Total Calls" className="outbound-th-num" />
              <ColumnHead icon={CheckCircle} label="Completed" className="outbound-th-num" />
              <ColumnHead icon={ArrowUp} label="Pick Up" className="outbound-th-num" />
              <ColumnHead icon={Voicemail} label="Voicemail" className="outbound-th-num" extra={<Info size={12} className="outbound-label-info" />} />
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((campaign) => {
              const stats = campaign.stats || {};
              return (
                <tr key={campaign._id} className="outbound-row" onClick={() => navigate(`/outbound/${campaign._id}`)}>
                  <td>
                    <p className="outbound-name">{campaign.name}</p>
                    <p className="outbound-name-sub">{createdOn(campaign.createdAt)}</p>
                  </td>
                  <td>
                    <StatusBadge status={campaign.status} />
                  </td>
                  <td className="outbound-cell-num">{stats.totalRecipients || 0}</td>
                  <td className="outbound-cell-num">{stats.completed || 0}</td>
                  <td className="outbound-cell-num">{stats.answered || 0}</td>
                  {/* TODO(outbound): no voicemail metric in CampaignRecipient schema — reference shows a percentage. */}
                  <td className="outbound-cell-num">0%</td>
                  <td className="outbound-cell-chevron">
                    <ChevronRight size={18} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
