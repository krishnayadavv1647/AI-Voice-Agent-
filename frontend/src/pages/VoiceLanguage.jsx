import { Languages, Mic2, SlidersHorizontal, Volume2 } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";

const defaultPronunciationRules = [
  "Use English text only for voice output.",
  "Keep pronunciation clear, natural, and professional.",
  "Speak business names, customer names, phone numbers, dates, and times clearly.",
  "Keep sentences short and easy to understand.",
  "Ask one question at a time."
].join("\n");

export default function VoiceLanguage() {
  return (
    <div className="page-stack">
      <PageHeader title="Voice & Language" description="Configure default voice behavior, English pronunciation, and provider preferences." />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <section className="card space-y-5">
          <Setting icon={Languages} title="Default Language">
            <select defaultValue="english">
              <option value="english">English</option>
              <option value="hindi">Hindi</option>
              <option value="hinglish">Hinglish</option>
              <option value="hindi_english">Hindi + English</option>
            </select>
          </Setting>
          <Setting icon={Mic2} title="Voice Provider">
            <select defaultValue="ElevenLabs">
              <option>Sarvam</option>
              <option>Cartesia</option>
              <option>ElevenLabs</option>
            </select>
          </Setting>
          <Setting icon={SlidersHorizontal} title="Voice Speed">
            <input type="range" min="0.7" max="1.3" step="0.1" defaultValue="1" />
          </Setting>
          <label className="flex items-center justify-between gap-4 rounded-2xl border border-hairline p-4 text-sm font-semibold text-neutral-700">
            English-only voice text
            <input className="h-5 w-5" type="checkbox" defaultChecked />
          </label>
          <label className="block text-sm font-semibold text-neutral-700">
            Pronunciation rules
            <textarea className="mt-2 min-h-40" defaultValue={defaultPronunciationRules} />
          </label>
          <button className="btn-primary"><Volume2 size={16} />Test Voice</button>
        </section>

        <aside className="card">
          <h2 className="panel-title">Voice Preview</h2>
          <p className="muted mt-2">Use this area to preview default language and TTS choices before applying them to agents.</p>
          <div className="mt-6 break-anywhere rounded-2xl bg-ink p-5 text-sm leading-6 text-white">
            Hello, welcome. I can help you with your booking request.
          </div>
        </aside>
      </div>
    </div>
  );
}

function Setting({ icon: Icon, title, children }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-hairline p-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="icon-tile"><Icon size={18} /></div>
        <p className="min-w-0 break-anywhere font-semibold text-ink">{title}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
