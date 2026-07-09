import { Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";

export default function KnowledgeBase() {
  const queryClient = useQueryClient();
  const { data: entries = [] } = useQuery({ queryKey: ["knowledge"], queryFn: () => api("/knowledge") });
  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: () => api("/agents") });
  const [form, setForm] = useState({ title: "", content: "", agentId: "" });

  function reloadKnowledge() {
    queryClient.invalidateQueries({ queryKey: ["knowledge"] });
  }

  async function submit(event) {
    event.preventDefault();
    await api("/knowledge", { method: "POST", body: { ...form, agentId: form.agentId || undefined } });
    setForm({ title: "", content: "", agentId: "" });
    reloadKnowledge();
  }

  async function remove(id) {
    if (!confirm("Delete this knowledge entry?")) return;
    await api(`/knowledge/${id}`, { method: "DELETE" });
    reloadKnowledge();
  }

  return (
    <div className="page-stack">
      <PageHeader title="Knowledge Base" description="Create simple text knowledge entries and attach them to agents." />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="card space-y-4">
          <h2 className="font-semibold text-ink">New knowledge entry</h2>
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
                  <h2 className="font-semibold text-ink">{entry.title}</h2>
                  <p className="mt-1 text-sm text-neutral-500">{entry.agentId?.agentName || "No agent attached"} · {new Date(entry.createdAt).toLocaleDateString()}</p>
                </div>
                <button title="Delete" className="rounded-lg border border-hairline p-2 text-rose-600" onClick={() => remove(entry._id)}><Trash2 size={16} /></button>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">{entry.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
