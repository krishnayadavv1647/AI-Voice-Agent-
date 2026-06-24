import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "./AuthContext.jsx";

const CreditsContext = createContext({ balance: 0, plan: null, planStatus: "inactive", loading: true, refresh: () => {} });

// Shared credit/plan state so the sidebar chip and the Credits/Billing pages stay in sync.
// Call refresh() after a purchase or a credit-burning action to update the UI immediately.
export function CreditsProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ balance: 0, plan: null, planStatus: "inactive", loading: true });

  const refresh = useCallback(async () => {
    try {
      const result = await api("/billing/plans");
      setState({ balance: result.balance ?? 0, plan: result.currentPlan || null, planStatus: result.planStatus || "inactive", loading: false });
    } catch {
      setState((current) => ({ ...current, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
    else setState({ balance: 0, plan: null, planStatus: "inactive", loading: false });
  }, [user?._id, refresh]);

  return <CreditsContext.Provider value={{ ...state, refresh }}>{children}</CreditsContext.Provider>;
}

export function useCredits() {
  return useContext(CreditsContext);
}
