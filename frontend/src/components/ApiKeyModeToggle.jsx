import { KeyRound } from "lucide-react";

const MODES = [
  { value: "default_system", title: "Default System", subtitle: "Inbuilt — uses credits" },
  { value: "byok", title: "Bring Your Own Keys", subtitle: "Connect your LLM key" }
];

export function normalizeApiKeyMode(value) {
  return value === "byok" ? "byok" : "default_system";
}

// Two-option segmented control that chooses whether an agent runs on the platform's inbuilt
// keys (Default System, credit-billed) or the user's own connected LLM account (BYOK).
export default function ApiKeyModeToggle({ value, onChange }) {
  const mode = normalizeApiKeyMode(value);

  return (
    <div className="rounded-2xl border border-hairline bg-white p-4">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound size={18} className="text-neutral-500" />
        <h3 className="font-semibold text-ink">API Keys</h3>
      </div>
      <p className="mb-3 text-sm text-neutral-500">
        Choose how this agent authenticates its AI model when it places a call.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((option) => {
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={`rounded-xl p-4 text-left transition ${selected ? "border-2 border-brand-500 bg-brand-50" : "border border-hairline bg-white hover:border-brand-200"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{option.title}</span>
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${selected ? "border-brand-500" : "border-neutral-300"}`}>
                  {selected && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-500">{option.subtitle}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
