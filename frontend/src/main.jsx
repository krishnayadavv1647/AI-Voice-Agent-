import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient.js";
import AppShell from "./shell/AppShell.jsx";
import AppLoader from "./components/AppLoader.jsx";
import { AuthProvider, useAuth } from "./state/AuthContext.jsx";
import { CreditsProvider } from "./state/CreditsContext.jsx";
import "./styles.css";
import "./email-inbox.css";

const AgentDetails = lazy(() => import("./pages/AgentDetails.jsx"));
const Agents = lazy(() => import("./pages/Agents.jsx"));
const Appointments = lazy(() => import("./pages/Appointments.jsx"));
const AuthPage = lazy(() => import("./pages/AuthPage.jsx"));
const AuthSuccess = lazy(() => import("./pages/AuthSuccess.jsx"));
const Billing = lazy(() => import("./pages/Billing.jsx"));
const BioPageBuilder = lazy(() => import("./pages/BioPageBuilder.jsx"));
const CallLogs = lazy(() => import("./pages/CallLogs.jsx"));
const Campaigns = lazy(() => import("./pages/Campaigns.jsx"));
const CreateAgent = lazy(() => import("./pages/CreateAgent.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const EditAgent = lazy(() => import("./pages/EditAgent.jsx"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase.jsx"));
const LeadFinder = lazy(() => import("./pages/LeadFinder.jsx"));
const Leads = lazy(() => import("./pages/Leads.jsx"));
const Messages = lazy(() => import("./pages/Messages.jsx"));
const PublicCallback = lazy(() => import("./pages/PublicCallback.jsx"));
const PublicAgent = lazy(() => import("./pages/PublicAgent.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Templates = lazy(() => import("./pages/Templates.jsx"));
const TestAgent = lazy(() => import("./pages/TestAgent.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));
const VoiceLanguage = lazy(() => import("./pages/VoiceLanguage.jsx"));
const Integrations = lazy(() => import("./pages/Integrations.jsx"));
const EmailOutreach = lazy(() => import("./pages/EmailOutreach.jsx"));
const EmailInbox = lazy(() => import("./pages/EmailInbox.jsx"));
const EmailIntegrationSettings = lazy(() => import("./pages/EmailIntegrationSettings.jsx"));
const FollowUps = lazy(() => import("./pages/FollowUps.jsx"));
const ImportCalls = lazy(() => import("./pages/ImportCalls.jsx"));
const TelephonyConfiguration = lazy(() => import("./pages/TelephonyConfiguration.jsx"));
const Credits = lazy(() => import("./pages/Credits.jsx"));
const Welcome = lazy(() => import("./pages/Welcome.jsx"));

function PageFallback() {
  return <div className="grid min-h-screen place-items-center text-neutral-500"><AppLoader /></div>;
}

function ProtectedRoute({ children, admin = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-neutral-500"><AppLoader label="Checking session" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !["admin", "super_admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
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
    </Suspense>
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
          <QueryClientProvider client={queryClient}>
            <Router />
          </QueryClientProvider>
        </CreditsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
