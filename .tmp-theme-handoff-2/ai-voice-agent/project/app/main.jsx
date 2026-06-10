// app/main.jsx — client router + mount
const PAGES = {
  dashboard: PageDashboard, agents: PageAgents, create: PageCreate, templates: PageTemplates,
  calls: PageCalls, leads: PageLeads, finder: PageFinder, appointments: PageAppointments, followups: PageFollowups, import: PageImport,
  messages: PageMessages, outreach: PageOutreach, inbox: PageInbox,
  knowledge: PageKnowledge, voice: PageVoice, telephony: PageTelephony, dograh: PageDograh, biopage: PageBioPage, settings: PageSettings, billing: PageBilling,
  admin: PageAdmin, welcome: PageWelcome,
};

function App() {
  const [route, setRoute] = React.useState(() => (location.hash || "#dashboard").slice(1));
  const go = React.useCallback((r) => {
    setRoute(r);
    if (location.hash.slice(1) !== r) location.hash = r;
    window.scrollTo(0, 0);
  }, []);
  React.useEffect(() => {
    const onHash = () => setRoute((location.hash || "#dashboard").slice(1));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const Page = PAGES[route] || PageDashboard;
  return (
    <AppShell route={route} go={go}>
      <Page go={go} />
    </AppShell>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
