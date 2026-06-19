import { MessageSquare, RefreshCw, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";

export default function Messages() {
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [threads, setThreads] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent._id === selectedAgentId) || null,
    [agents, selectedAgentId]
  );
  const activeMessages = selectedAgentId ? threads[selectedAgentId] || [] : [];

  useEffect(() => {
    loadAgents();
  }, []);

  async function loadAgents() {
    setError("");
    try {
      const result = await api("/agents");
      setAgents(result);
      setSelectedAgentId((current) => current || result[0]?._id || "");
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    }
  }

  function lastMessage(agentId) {
    const items = threads[agentId] || [];
    return items[items.length - 1]?.text || "No recent message";
  }

  async function sendMessage(event) {
    event?.preventDefault();
    const text = message.trim();
    if (!text || !selectedAgentId || loading) return;

    setError("");
    setMessage("");
    setLoading(true);

    setThreads((current) => ({
      ...current,
      [selectedAgentId]: [...(current[selectedAgentId] || []), { role: "user", text }]
    }));

    try {
      const result = await api(`/agents/${selectedAgentId}/test-chat`, {
        method: "POST",
        body: {
          message: text,
          conversationId: `messages:${selectedAgentId}`
        }
      });

      setThreads((current) => ({
        ...current,
        [selectedAgentId]: [
          ...(current[selectedAgentId] || []),
          { role: "assistant", text: result.reply || result.response || "No response returned." }
        ]
      }));
    } catch (err) {
      const errorText = err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
      setError(errorText);
      setThreads((current) => ({
        ...current,
        [selectedAgentId]: [
          ...(current[selectedAgentId] || []),
          { role: "assistant", text: "Message failed. Check backend Gemini/custom engine configuration.", error: true }
        ]
      }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Messages"
        description="Review and test AI message conversations using your custom agent runtime."
        action={<button className="btn-secondary" onClick={loadAgents}><RefreshCw size={16} />Refresh</button>}
      />

      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="card">
          <h2 className="panel-title">Conversations</h2>
          <div className="mt-4 space-y-3">
            {!agents.length ? (
              <p className="rounded-2xl border border-dashed border-hairline p-4 text-sm text-neutral-500">No agents available.</p>
            ) : (
              agents.map((agent) => (
                <button
                  key={agent._id}
                  className={`w-full rounded-2xl border p-3 text-left transition hover:bg-neutral-50 ${
                    selectedAgentId === agent._id ? "border-brand-300 bg-brand-50" : "border-hairline"
                  }`}
                  onClick={() => setSelectedAgentId(agent._id)}
                >
                  <p className="break-anywhere font-semibold text-ink">{agent.agentName || agent.name || "Untitled Agent"}</p>
                  <p className="line-clamp-1 text-sm text-neutral-500">{lastMessage(agent._id)}</p>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="card min-h-[520px]">
          <div className="mb-4 flex items-center gap-3">
            <div className="icon-tile"><MessageSquare size={18} /></div>
            <div>
              <h2 className="panel-title">{selectedAgent ? selectedAgent.agentName || selectedAgent.name : "Message Test Inbox"}</h2>
              <p className="muted">{selectedAgent ? "Send a test message to this agent." : "Select an agent conversation first."}</p>
            </div>
          </div>

          <div className="min-h-[260px] rounded-2xl border border-dashed border-hairline p-4">
            {!selectedAgent ? (
              <EmptyState title="Select an agent" description="Choose an agent conversation from the left to start messaging." />
            ) : !activeMessages.length ? (
              <EmptyState title="No message conversations yet" description="Send a message below to start a chat with this agent." />
            ) : (
              <div className="space-y-3">
                {activeMessages.map((item, index) => (
                  <div key={`${item.role}-${index}`} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                      item.role === "user"
                        ? "bg-brand-600 text-white"
                        : item.error
                          ? "bg-rose-50 text-rose-700"
                          : "bg-neutral-100 text-neutral-800"
                    }`}>
                      {item.text}
                    </div>
                  </div>
                ))}
                {loading && <p className="text-sm text-neutral-500">Agent is typing...</p>}
              </div>
            )}
          </div>

          <form className="mt-6 flex gap-2 rounded-2xl border border-hairline bg-neutral-50 p-2" onSubmit={sendMessage}>
            <input
              className="border-0 bg-transparent focus:ring-0"
              placeholder={selectedAgent ? "Type a message..." : "Select an agent conversation first..."}
              disabled={!selectedAgent || loading}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <button className="btn-primary" disabled={!selectedAgent || !message.trim() || loading}>
              <Send size={16} />{loading ? "Sending..." : "Send"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
