import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./shell/AppShell.jsx";
import { AuthProvider, useAuth } from "./state/AuthContext.jsx";
import "./styles.css";

import AgentDetails from "./pages/AgentDetails.jsx";
import Agents from "./pages/Agents.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import AuthSuccess from "./pages/AuthSuccess.jsx";
import Billing from "./pages/Billing.jsx";
import CallLogs from "./pages/CallLogs.jsx";
import CreateAgent from "./pages/CreateAgent.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import EditAgent from "./pages/EditAgent.jsx";
import KnowledgeBase from "./pages/KnowledgeBase.jsx";
import Leads from "./pages/Leads.jsx";
import Messages from "./pages/Messages.jsx";
import PublicCallback from "./pages/PublicCallback.jsx";
import PublicAgent from "./pages/PublicAgent.jsx";
import Settings from "./pages/Settings.jsx";
import Templates from "./pages/Templates.jsx";
import TestAgent from "./pages/TestAgent.jsx";
import Admin from "./pages/Admin.jsx";
import VoiceLanguage from "./pages/VoiceLanguage.jsx";
import DograhSettings from "./pages/DograhSettings.jsx";
import TelephonyConfiguration from "./pages/TelephonyConfiguration.jsx";
import Welcome from "./pages/Welcome.jsx";

function ProtectedRoute({ children, admin = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-slate-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

function Router() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/auth/success" element={<AuthSuccess />} />
      <Route path="/call/:agentId" element={<PublicCallback />} />
      <Route path="/a/:publicSlug" element={<PublicAgent />} />
      <Route path="/" element={<Welcome />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/:id" element={<AgentDetails />} />
        <Route path="agents/:id/edit" element={<EditAgent />} />
        <Route path="agents/:id/test" element={<TestAgent />} />
        <Route path="create-agent" element={<CreateAgent />} />
        <Route path="calls" element={<CallLogs />} />
        <Route path="leads" element={<Leads />} />
        <Route path="messages" element={<Messages />} />
        <Route path="templates" element={<Templates />} />
        <Route path="voice-language" element={<VoiceLanguage />} />
        <Route path="telephony-configuration" element={<TelephonyConfiguration />} />
        <Route path="dograh-settings" element={<DograhSettings />} />
        <Route path="knowledge" element={<KnowledgeBase />} />
        <Route path="billing" element={<Billing />} />
        <Route path="settings" element={<Settings />} />
        <Route
          path="admin"
          element={
            <ProtectedRoute admin>
              <Admin />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
