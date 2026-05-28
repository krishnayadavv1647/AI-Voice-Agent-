import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";

export default function KnowledgeBase() {
  const [entries, setEntries] = useState([]);
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({ title: "", content: "", agentId: "" });

  async function load() {
    const [knowledge, agentList] = await Promise.all([api("/knowledge"), api("/agents")]);
    setEntries(knowledge);
    setAgents(agentList);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event) {
    event.preventDefault();
    await api("/knowledge", { method: "POST", body: { ...form, agentId: form.agentId || undefined } });
    setForm({ title: "", content: "", agentId: "" });
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this knowledge entry?")) return;
    await api(`/knowledge/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <PageHeader title="Knowledge Base" description="Create simple text knowledge entries and attach them to agents." />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="card space-y-4">
          <h2 className="font-bold text-ink">New knowledge entry</h2>
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          <textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} required />
          <select value={form.agentId} onChange={(event) => setForm({ ...form, agentId: event.target.value })}>
            <option value="">No agent attached</option>
            {agents.map((agent) => <option key={agent._id} value={agent._id}>{agent.agentName}</option>)}
          </select>
          <button className="btn-primary"><Plus size={16} />Create Entry</button>
        </form>
        <div className="grid gap-4">
          {entries.map((entry) => (
            <div key={entry._id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-bold text-ink">{entry.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{entry.agentId?.agentName || "No agent attached"} · {new Date(entry.createdAt).toLocaleDateString()}</p>
                </div>
                <button title="Delete" className="rounded-lg border border-slate-200 p-2 text-rose-600" onClick={() => remove(entry._id)}><Trash2 size={16} /></button>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{entry.content}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
