import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setToken } from "../lib/api.js";

export default function AuthSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("Google login failed. Token was not returned.");
      return;
    }

    setToken(token);
    window.location.replace("/dashboard");
  }, [navigate, searchParams]);

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white p-6 text-center text-ink shadow-pop">
        <h1 className="text-xl font-bold">{error ? "Google login failed" : "Signing you in..."}</h1>
        <p className="mt-2 text-sm text-neutral-500">{error || "Please wait while we open your dashboard."}</p>
        {error && <button className="btn-primary mt-5" onClick={() => navigate("/login")}>Back to login</button>}
      </div>
    </main>
  );
}
