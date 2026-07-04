import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./shell/AppShell.jsx";
import { AuthProvider, useAuth } from "./state/AuthContext.jsx";
import { CreditsProvider } from "./state/CreditsContext.jsx";
import "./styles.css";

import AgentDetails from "./pages/AgentDetails.jsx";
import Agents from "./pages/Agents.jsx";
import Appointments from "./pages/Appointments.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import AuthSuccess from "./pages/AuthSuccess.jsx";
import Billing from "./pages/Billing.jsx";
import BioPageBuilder from "./pages/BioPageBuilder.jsx";
import CallLogs from "./pages/CallLogs.jsx";
import Campaigns from "./pages/Campaigns.jsx";
import CreateAgent from "./pages/CreateAgent.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import EditAgent from "./pages/EditAgent.jsx";
import KnowledgeBase from "./pages/KnowledgeBase.jsx";
import LeadFinder from "./pages/LeadFinder.jsx";
import Leads from "./pages/Leads.jsx";
import Messages from "./pages/Messages.jsx";
import PublicCallback from "./pages/PublicCallback.jsx";
import PublicAgent from "./pages/PublicAgent.jsx";
import Settings from "./pages/Settings.jsx";
import Templates from "./pages/Templates.jsx";
import TestAgent from "./pages/TestAgent.jsx";
import Admin from "./pages/Admin.jsx";
import VoiceLanguage from "./pages/VoiceLanguage.jsx";
import Integrations from "./pages/Integrations.jsx";
import EmailOutreach from "./pages/EmailOutreach.jsx";
import EmailInbox from "./pages/EmailInbox.jsx";
import EmailIntegrationSettings from "./pages/EmailIntegrationSettings.jsx";
import FollowUps from "./pages/FollowUps.jsx";
import ImportCalls from "./pages/ImportCalls.jsx";
import TelephonyConfiguration from "./pages/TelephonyConfiguration.jsx";
import Credits from "./pages/Credits.jsx";
import Welcome from "./pages/Welcome.jsx";

function ProtectedRoute({ children, admin = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-neutral-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !["admin", "super_admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;
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
        <Route path="agents/:id/bio-page" element={<BioPageBuilder />} />
        <Route path="agents/:id/edit" element={<EditAgent />} />
        <Route path="agents/:id/test" element={<TestAgent />} />
        <Route path="create-agent" element={<CreateAgent />} />
        <Route path="calls" element={<CallLogs />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="leads" element={<Leads />} />
        <Route path="lead-finder" element={<LeadFinder />} />
        <Route path="email-outreach" element={<EmailOutreach />} />
        <Route path="email-inbox" element={<EmailInbox />} />
        <Route path="followups" element={<FollowUps />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="import-calls" element={<ImportCalls />} />
        <Route path="messages" element={<Messages />} />
        <Route path="templates" element={<Templates />} />
        <Route path="voice-language" element={<VoiceLanguage />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="integrations/voice-providers" element={<Navigate to="/integrations" replace />} />
        <Route path="integrations/llm-providers" element={<Navigate to="/integrations" replace />} />
        <Route path="telephony-configuration" element={<TelephonyConfiguration />} />
        <Route path="telephony-configuration/:id" element={<TelephonyConfiguration />} />
        <Route path="knowledge" element={<KnowledgeBase />} />
        <Route path="billing" element={<Billing />} />
        <Route path="credits" element={<Credits />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/email" element={<EmailIntegrationSettings />} />
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

const rootElement = document.getElementById("root");
const root = rootElement.__reactRoot || ReactDOM.createRoot(rootElement);
rootElement.__reactRoot = root;

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CreditsProvider>
          <Router />
        </CreditsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
