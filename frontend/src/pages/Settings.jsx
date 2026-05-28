import { Save } from "lucide-react";
import { useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../state/AuthContext.jsx";

export default function Settings() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState({ leads: true, calls: true, weekly: false });

  return (
    <>
      <PageHeader title="Settings" description="Profile, security, API, and notification preferences." />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card space-y-4">
          <h2 className="font-bold text-ink">Profile</h2>
          <label className="block text-sm font-medium text-slate-700">Profile name<input className="mt-1" value={user?.name || ""} readOnly /></label>
          <label className="block text-sm font-medium text-slate-700">Email<input className="mt-1" value={user?.email || ""} readOnly /></label>
          <button className="btn-secondary" onClick={() => alert("Profile editing can be connected next.")}><Save size={16} />Save Changes</button>
        </section>
        <section className="card space-y-4">
          <h2 className="font-bold text-ink">Password change</h2>
          <input type="password" aria-label="Current password" />
          <input type="password" aria-label="New password" />
          <button className="btn-secondary" onClick={() => alert("Password change endpoint can be connected next.")}>Update Password</button>
        </section>
        <section className="card space-y-4">
          <h2 className="font-bold text-ink">API settings</h2>
          <p className="text-sm text-slate-500">Dograh credentials are configured securely on the backend through environment variables.</p>
          <input value="DOGRAH_API_KEY is server-only" readOnly />
        </section>
        <section className="card space-y-4">
          <h2 className="font-bold text-ink">Notifications</h2>
          {Object.entries(notifications).map(([key, value]) => (
            <label key={key} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm font-medium capitalize">
              {key}
              <input className="h-4 w-4" type="checkbox" checked={value} onChange={(event) => setNotifications({ ...notifications, [key]: event.target.checked })} />
            </label>
          ))}
        </section>
      </div>
    </>
  );
}
