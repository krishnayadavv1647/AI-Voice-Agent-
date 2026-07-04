import { PhoneCall } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";

export default function TestAgent() {
  const { id } = useParams();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const response = await api(`/agents/${id}/test-call`, { method: "POST", body: { phoneNumber } });
      setResult(response);
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader title="Test Call" description="Trigger a real Vapi test call through the backend." action={<Link className="btn-secondary" to={`/agents/${id}`}>Agent Details</Link>} />
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form className="card space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-neutral-700">
            Destination phone number
            <input className="mt-1" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
          </label>
          <p className="text-xs text-neutral-500">Use E.164 format, for example +910000000000.</p>
          {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          <button className="btn-primary" disabled={loading}><PhoneCall size={16} />{loading ? "Calling..." : "Trigger Test Call"}</button>
        </form>

        <section className="card">
          <h2 className="mb-3 font-semibold text-ink">Provider response</h2>
          {result ? (
            <pre className="max-h-[520px] overflow-auto rounded-lg bg-ink p-4 text-xs text-slate-100">{JSON.stringify(result, null, 2)}</pre>
          ) : (
            <p className="text-sm text-neutral-500">The provider response will appear after a call is triggered.</p>
          )}
        </section>
      </div>
    </div>
  );
}
