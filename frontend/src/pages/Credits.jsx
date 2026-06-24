import { Coins, CreditCard, RefreshCw, TrendingDown, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";
import { useCredits } from "../state/CreditsContext.jsx";

function fmtNum(value) {
  return Number(value || 0).toLocaleString();
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default function Credits() {
  const { refresh } = useCredits();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError("");
    try {
      const result = await api("/credits");
      setData(result);
      refresh();
    } catch (err) {
      setError(err.response?.message || err.message);
    } finally {
      setLoading(false);
    }
  }

  const balance = data?.balance ?? 0;
  const reserved = data?.reserved ?? 0;
  const pricing = data?.pricing || {};
  const transactions = data?.transactions || [];
  const usage = data?.usage || [];

  return (
    <div className="page-stack">
      <PageHeader title="Credits & Usage" description="Your platform credit balance, what each call costs, and a full history of charges and usage." />

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid min-w-0 gap-5 xl:grid-cols-3 xl:gap-6">
        <section className="card xl:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-neutral-500">
                <Wallet size={16} /><span className="text-xs font-semibold uppercase">Available Credits</span>
              </div>
              <p className="text-4xl font-bold text-ink">{loading ? "…" : fmtNum(balance)}</p>
              <p className="mt-1 text-sm text-neutral-500">{fmtNum(reserved)} reserved by in-flight calls</p>
            </div>
            <div className="flex flex-col gap-2">
              <Link className="btn-primary" to="/billing"><CreditCard size={16} />Buy credits</Link>
              <button className="btn-secondary" disabled={loading} onClick={load}><RefreshCw size={16} />Refresh</button>
            </div>
          </div>
        </section>

        <aside className="card">
          <div className="mb-3 flex items-center gap-2 text-neutral-500">
            <Coins size={16} /><span className="text-xs font-semibold uppercase">What features cost</span>
          </div>
          <div className="space-y-3">
            {Object.entries(pricing).map(([action, rate]) => (
              <div key={action} className="rounded-xl border border-hairline p-3">
                <p className="font-semibold text-ink">{action.replace(/_/g, " ")}</p>
                <p className="mt-1 text-sm text-neutral-600">Platform credits: <span className="font-semibold text-ink">{fmtNum(rate.cost)}</span></p>
                <p className="text-sm text-neutral-600">Own key (BYOK) fee: <span className="font-semibold text-ink">{fmtNum(rate.platformFee)}</span></p>
              </div>
            ))}
            {!Object.keys(pricing).length && <p className="text-sm text-neutral-500">No pricing configured.</p>}
          </div>
        </aside>

        <section className="card xl:col-span-3">
          <div className="mb-4 flex items-center gap-2">
            <TrendingDown size={18} className="text-neutral-500" />
            <h2 className="panel-title">Usage History</h2>
          </div>
          <Table
            columns={["When", "Action", "Mode", "Result", "Credits charged", "Notes"]}
            rows={usage.map((u) => [
              fmtDate(u.createdAt),
              (u.action || "").replace(/_/g, " "),
              <ModeBadge key="m" mode={u.mode} />,
              u.success ? "Success" : (u.error || "Failed"),
              fmtNum(u.creditsCharged),
              u.modeSwitched ? `Switched (${u.switchReason || "fallback"})` : ""
            ])}
            empty="No calls billed yet. Place a call (once credit enforcement is on) to see usage here."
          />
        </section>

        <section className="card xl:col-span-3">
          <h2 className="panel-title mb-4">Credit Ledger</h2>
          <Table
            columns={["When", "Type", "Mode", "Amount", "Balance after"]}
            rows={transactions.map((t) => [
              fmtDate(t.createdAt),
              t.type,
              <ModeBadge key="m" mode={t.mode} />,
              `${t.type === "topup" || t.type === "release" || t.type === "refund" ? "+" : "-"}${fmtNum(t.amount)}`,
              t.balanceAfter == null ? "-" : fmtNum(t.balanceAfter)
            ])}
            empty="No transactions yet. Add demo credits above to see the ledger populate."
          />
        </section>
      </div>
    </div>
  );
}

function ModeBadge({ mode }) {
  const map = {
    platform_credits: "bg-brand-50 text-brand-700",
    byok: "bg-violet-50 text-violet-700",
    blocked: "bg-rose-50 text-rose-700",
    system: "bg-neutral-100 text-neutral-600"
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[mode] || "bg-neutral-100 text-neutral-600"}`}>{(mode || "").replace(/_/g, " ") || "-"}</span>;
}

function Table({ columns, rows, empty }) {
  if (!rows.length) {
    return <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-500">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-hairline text-xs uppercase text-neutral-500">
            {columns.map((col) => <th key={col} className="py-2 pr-4 font-semibold">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, idx) => (
            <tr key={idx} className="border-b border-hairline/60">
              {cells.map((cell, cellIdx) => <td key={cellIdx} className="py-2 pr-4 text-neutral-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
