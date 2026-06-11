import { Download, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { API_URL, api, getToken } from "../lib/api.js";

const fields = ["name", "phone", "email", "city", "agent", "callDate", "callTime", "timezone", "purpose", "notes"];

function errorText(err) {
  return err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
}

function rowStatus(row) {
  if (row.status === "valid") return "valid";
  if (row.status === "imported") return "imported";
  if (row.status === "skipped") return "skipped";
  return row.error || "invalid";
}

export default function ImportCalls() {
  const [agents, setAgents] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [file, setFile] = useState(null);
  const [activeRun, setActiveRun] = useState(null);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showScheduleConfirm, setShowScheduleConfirm] = useState(false);

  const validCount = useMemo(() => rows.filter((row) => row.status === "valid").length, [rows]);
  const invalidCount = useMemo(() => rows.filter((row) => row.status === "invalid").length, [rows]);

  async function loadBase() {
    const [agentList, runList] = await Promise.all([api("/agents"), api("/import-calls/runs")]);
    setAgents(agentList);
    setRuns(runList);
    setSelectedAgentId((current) => current || agentList[0]?._id || "");
  }

  useEffect(() => {
    loadBase().catch((err) => setError(errorText(err)));
  }, []);

  async function uploadFile() {
    if (!file) {
      setError("Choose a CSV or XLSX file first.");
      return;
    }
    if (!selectedAgentId) {
      setError("Select an agent first.");
      return;
    }

    setLoading("upload");
    setNotice("");
    setError("");
    setSummary(null);

    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/import-calls/upload?agentId=${encodeURIComponent(selectedAgentId)}&fileName=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: {
          "Content-Type": file.name.toLowerCase().endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: await file.arrayBuffer()
      });
      const payload = await response.json();
      if (!response.ok) throw Object.assign(new Error(payload.message || "Upload failed"), { response: payload });

      setActiveRun(payload.run);
      setRows(payload.rows || []);
      setHeaders(payload.headers || []);
      setMapping(payload.mapping || {});
      setNotice("File uploaded. Review mapping, then validate rows.");
      await loadBase();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading("");
    }
  }

  async function validateFile() {
    if (!activeRun?._id) return;
    setLoading("validate");
    setNotice("");
    setError("");
    try {
      const result = await api(`/import-calls/${activeRun._id}/validate`, { method: "POST", body: { mapping } });
      setActiveRun(result.run);
      setRows(result.rows || []);
      setNotice(`Validated ${result.run.totalRows} rows. ${result.run.validRows} valid, ${result.run.invalidRows} invalid.`);
      await loadBase();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading("");
    }
  }

  async function importRows() {
    if (!activeRun?._id) return;
    setShowScheduleConfirm(false);
    setLoading("import");
    setNotice("");
    setError("");
    try {
      const result = await api(`/import-calls/${activeRun._id}/import`, { method: "POST" });
      setSummary(result);
      const created = result.importedRows || 0;
      setNotice(created === 1 ? "1 scheduled call created" : `${created} scheduled calls created`);
      const fresh = await api(`/import-calls/${activeRun._id}`);
      setActiveRun(fresh.run);
      setRows(fresh.rows || []);
      await loadBase();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading("");
    }
  }

  function confirmScheduleRows() {
    if (!validCount) {
      setError("No valid rows available to schedule.");
      return;
    }
    setShowScheduleConfirm(true);
  }

  async function openRun(run) {
    setLoading(`run-${run._id}`);
    setNotice("");
    setError("");
    try {
      const result = await api(`/import-calls/${run._id}`);
      setActiveRun(result.run);
      setRows(result.rows || []);
      setHeaders(Object.keys(result.rows?.[0]?.raw || {}));
      setMapping({});
      setSummary(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading("");
    }
  }

  async function downloadErrors() {
    if (!activeRun?._id) return;
    const csv = await api(`/import-calls/${activeRun._id}/errors`);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeRun.fileName || "import"}-errors.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Import Calls"
        description="Upload call schedules from CSV or Excel, validate rows, and schedule AI calls safely."
        action={<button className="btn-secondary" onClick={() => loadBase().catch((err) => setError(errorText(err)))}><RefreshCw size={16} />Refresh</button>}
      />

      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <section className="card mb-4">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-semibold text-slate-700">
            Select Agent
            <select className="mt-1" value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
              {agents.map((agent) => <option key={agent._id} value={agent._id}>{agent.agentName}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Upload CSV / XLSX
            <input className="mt-1" type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
          <button className="btn-primary self-end" disabled={loading === "upload"} onClick={uploadFile}>
            <Upload size={16} />{loading === "upload" ? "Uploading..." : "Upload"}
          </button>
        </div>
      </section>

      {activeRun && (
        <>
          <section className="card mb-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-950">{activeRun.fileName}</h2>
                <p className="text-sm text-slate-500">Total {activeRun.totalRows || rows.length} rows · {validCount} valid · {invalidCount} invalid</p>
              </div>
              <div className="action-row">
                <button className="btn-secondary" disabled={loading === "validate"} onClick={validateFile}><FileSpreadsheet size={16} />{loading === "validate" ? "Validating..." : "Validate File"}</button>
                <button className="btn-primary" disabled={!validCount || loading === "import"} onClick={confirmScheduleRows}><Upload size={16} />{loading === "import" ? "Scheduling..." : "Schedule All Valid Rows"}</button>
                <button className="btn-secondary" disabled={!rows.length} onClick={downloadErrors}><Download size={16} />Download Error Rows</button>
              </div>
            </div>

            {!!headers.length && (
              <div className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                {fields.map((field) => (
                  <label key={field} className="text-sm font-semibold text-slate-700">
                    {field}
                    <select className="mt-1" value={mapping[field] || ""} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}>
                      <option value="">Not mapped</option>
                      {headers.map((header) => <option key={`${field}-${header}`} value={header}>{header}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}

            <div className="table-wrap">
              <table className="table w-full min-w-[1150px]">
                <thead>
                  <tr><th>Name</th><th>Phone</th><th>Email</th><th>Call Date</th><th>Call Time</th><th>Timezone</th><th>Purpose</th><th>Status</th><th>Error</th></tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row._id}>
                      <td>{row.name || "-"}</td>
                      <td className="break-anywhere">{row.phone || "-"}</td>
                      <td className="break-anywhere">{row.email || "-"}</td>
                      <td>{row.callDate || "-"}</td>
                      <td>{row.callTime || "-"}</td>
                      <td>{row.timezone || "-"}</td>
                      <td>{row.purpose || "-"}</td>
                      <td><StatusBadge status={rowStatus(row)} /></td>
                      <td className="text-rose-700">{row.error || "-"}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan="9" className="text-center text-slate-500">No rows to preview.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {summary && (
            <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Total Rows" value={summary.totalRows} />
              <SummaryCard label="Scheduled Calls" value={summary.importedRows} />
              <SummaryCard label="Invalid Rows" value={summary.invalidRows} />
              <SummaryCard label="Skipped Duplicates" value={summary.skippedRows} />
            </section>
          )}
        </>
      )}

      {showScheduleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-950">Confirm Schedule</h2>
            <p className="mt-2 text-sm text-slate-600">
              This will create scheduled AI calls for all {validCount} valid row{validCount === 1 ? "" : "s"} in this import.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className="btn-secondary" disabled={loading === "import"} onClick={() => setShowScheduleConfirm(false)}>Cancel</button>
              <button className="btn-primary" disabled={loading === "import"} onClick={importRows}>
                <Upload size={16} />{loading === "import" ? "Scheduling..." : "Confirm Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="card overflow-hidden p-0">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-bold text-slate-950">Import History</h2>
        </div>
        {!runs.length ? (
          <div className="p-6"><EmptyState title="No imports yet" description="Uploaded call schedules will appear here." /></div>
        ) : (
          <div className="table-wrap">
            <table className="table w-full min-w-[900px]">
              <thead><tr><th>File Name</th><th>Agent</th><th>Total Rows</th><th>Imported Rows</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run._id}>
                    <td className="break-anywhere">{run.fileName}</td>
                    <td>{run.agentId?.agentName || "Agent"}</td>
                    <td>{run.totalRows}</td>
                    <td>{run.importedRows}</td>
                    <td><StatusBadge status={run.status} /></td>
                    <td>{run.createdAt ? new Date(run.createdAt).toLocaleString() : "-"}</td>
                    <td><button className="btn-secondary px-3 py-1.5 text-xs" disabled={loading === `run-${run._id}`} onClick={() => openRun(run)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function SummaryCard({ label, value }) {
  return <article className="card"><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-950">{value || 0}</p></article>;
}
