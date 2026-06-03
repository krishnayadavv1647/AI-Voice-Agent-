import { Headphones, MessageCircle, Send, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { loadDograhWidget } from "../utils/loadDograhWidget.js";

function makeSessionId() {
  const existing = sessionStorage.getItem("public_agent_session_id");
  if (existing) return existing;

  const next = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  sessionStorage.setItem("public_agent_session_id", next);
  return next;
}

export default function PublicAgent() {
  const { publicSlug } = useParams();
  const [agent, setAgent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [callStatus, setCallStatus] = useState("idle");
  const [error, setError] = useState("");
  const sessionId = useMemo(makeSessionId, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        setAgent(await api(`/public/agents/${publicSlug}`));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [publicSlug]);

  async function sendMessage(event) {
    event.preventDefault();
    const text = message.trim();
    if (!text || !agent?.publicChatEnabled) return;

    setMessage("");
    setChatLoading(true);
    setError("");
    setMessages((current) => [...current, { role: "user", text }]);

    try {
      const result = await api(`/public/agents/${publicSlug}/chat`, {
        method: "POST",
        body: { message: text, sessionId }
      });
      setMessages((current) => [...current, { role: "assistant", text: result.reply || result.response }]);
    } catch (err) {
      setError(err.message);
      setMessages((current) => [...current, { role: "assistant", text: "Message failed. Please try again.", error: true }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function startWebCall() {
    setError("");
    setCallStatus("connecting");

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.getTracks().forEach((track) => track.stop());
      const { embedToken } = await api(`/public/agents/${publicSlug}/web-call-token`, { method: "POST" });
      const widget = await loadDograhWidget(embedToken);

      widget.onCallConnected?.(() => setCallStatus("connected"));
      widget.onCallDisconnected?.(() => setCallStatus("ended"));
      widget.onCallEnd?.(() => setCallStatus("ended"));
      widget.onError?.((err) => {
        setError(err?.message || "Web call failed.");
        setCallStatus("error");
      });

      await widget.start();
    } catch (err) {
      setError(err.message || "Web call failed.");
      setCallStatus("error");
    }
  }

  async function endWebCall() {
    await window.DograhWidget?.end?.();
    setCallStatus("ended");
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-500">Loading...</main>;

  if (error && !agent) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-4 text-center text-rose-700">{error}</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:py-10">
      <section className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col justify-center rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <p className="mb-3 text-sm font-semibold uppercase text-brand-700">AI Assistant</p>
          <h1 className="break-anywhere text-3xl font-bold tracking-tight sm:text-5xl">{agent.publicTitle || agent.name}</h1>
          {agent.publicDescription && <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">{agent.publicDescription}</p>}
          {agent.publicWelcomeMessage && <p className="mt-5 rounded-xl bg-brand-50 p-4 text-sm font-medium text-brand-900">{agent.publicWelcomeMessage}</p>}

          {agent.publicWebCallEnabled && (
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button className="btn-primary" disabled={callStatus === "connecting" || callStatus === "connected"} onClick={startWebCall}>
                <Headphones size={16} />
                {callStatus === "connecting" ? "Connecting..." : "Start Web Call"}
              </button>
              <button className="btn-secondary" disabled={callStatus !== "connected"} onClick={endWebCall}>
                <Square size={16} />
                End Call
              </button>
            </div>
          )}
          {callStatus !== "idle" && <p className="mt-3 text-sm font-semibold capitalize text-slate-600">Call status: {callStatus}</p>}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <MessageCircle className="text-brand-700" size={20} />
            <h2 className="font-bold text-ink">Chat</h2>
          </div>

          {error && <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          <div className="mb-4 flex h-[420px] flex-col gap-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
            {messages.map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                className={`max-w-[86%] rounded-xl px-4 py-3 text-sm ${
                  item.role === "user"
                    ? "ml-auto bg-brand-600 text-white"
                    : item.error
                      ? "bg-rose-50 text-rose-700"
                      : "bg-white text-slate-800 shadow-sm"
                }`}
              >
                {item.text}
              </div>
            ))}
            {!messages.length && (
              <div className="grid min-h-full place-items-center text-center text-sm text-slate-500">
                {agent.publicChatEnabled ? "Send a message to start." : "Chat is not enabled for this agent."}
              </div>
            )}
          </div>

          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={sendMessage}>
            <input disabled={!agent.publicChatEnabled} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type your message..." />
            <button className="btn-primary" disabled={chatLoading || !agent.publicChatEnabled}>
              <Send size={16} />
              {chatLoading ? "Sending..." : "Send"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
