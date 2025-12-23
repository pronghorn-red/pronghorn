import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { PageLoader } from "./components/PageLoader";

// Eagerly loaded (lightweight pages)
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import License from "./pages/License";

// Lazy loaded (heavy pages with large dependencies)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Standards = lazy(() => import("./pages/Standards"));
const TechStacks = lazy(() => import("./pages/TechStacks"));
const BuildBooks = lazy(() => import("./pages/BuildBooks"));
const BuildBookDetail = lazy(() => import("./pages/BuildBookDetail"));
const BuildBookEditor = lazy(() => import("./pages/BuildBookEditor"));
const Settings = lazy(() => import("./pages/Settings"));

// Project pages (all use heavy libraries like Monaco, ReactFlow, etc.)
const Requirements = lazy(() => import("./pages/project/Requirements"));
const ProjectStandards = lazy(() => import("./pages/project/Standards"));
const Canvas = lazy(() => import("./pages/project/Canvas"));
const Audit = lazy(() => import("./pages/project/Audit"));
const Build = lazy(() => import("./pages/project/Build"));
const Repository = lazy(() => import("./pages/project/Repository"));
const ProjectSettings = lazy(() => import("./pages/project/ProjectSettings"));
const Specifications = lazy(() => import("./pages/project/Specifications"));
const Deploy = lazy(() => import("./pages/project/Deploy"));
const Database = lazy(() => import("./pages/project/Database"));
const Artifacts = lazy(() => import("./pages/project/Artifacts"));
const Chat = lazy(() => import("./pages/project/Chat"));

const App = () => (
  <>
    <ScrollToTop />
    <PWAUpdatePrompt />
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/standards" element={<Standards />} />
        <Route path="/tech-stacks" element={<TechStacks />} />
        <Route path="/build-books" element={<BuildBooks />} />
        <Route path="/build-books/new" element={<BuildBookEditor />} />
        <Route path="/build-books/:id" element={<BuildBookDetail />} />
        <Route path="/build-books/:id/edit" element={<BuildBookEditor />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/license" element={<License />} />
        <Route path="/settings/organization" element={<Settings />} />
        <Route path="/settings/profile" element={<Settings />} />
        
        {/* Project Routes - Standard (authenticated users) */}
        <Route path="/project/:projectId/settings" element={<ProjectSettings />} />
        <Route path="/project/:projectId/artifacts" element={<Artifacts />} />
        <Route path="/project/:projectId/chat" element={<Chat />} />
        <Route path="/project/:projectId/requirements" element={<Requirements />} />
        <Route path="/project/:projectId/standards" element={<ProjectStandards />} />
        <Route path="/project/:projectId/canvas" element={<Canvas />} />
        <Route path="/project/:projectId/audit" element={<Audit />} />
        <Route path="/project/:projectId/build" element={<Build />} />
        <Route path="/project/:projectId/repository" element={<Repository />} />
        <Route path="/project/:projectId/specifications" element={<Specifications />} />
        <Route path="/project/:projectId/database" element={<Database />} />
        <Route path="/project/:projectId/deploy" element={<Deploy />} />
        
        {/* Project Routes - With Token (shared access via path-based token) */}
        <Route path="/project/:projectId/settings/t/:token" element={<ProjectSettings />} />
        <Route path="/project/:projectId/artifacts/t/:token" element={<Artifacts />} />
        <Route path="/project/:projectId/chat/t/:token" element={<Chat />} />
        <Route path="/project/:projectId/requirements/t/:token" element={<Requirements />} />
        <Route path="/project/:projectId/standards/t/:token" element={<ProjectStandards />} />
        <Route path="/project/:projectId/canvas/t/:token" element={<Canvas />} />
        <Route path="/project/:projectId/audit/t/:token" element={<Audit />} />
        <Route path="/project/:projectId/build/t/:token" element={<Build />} />
        <Route path="/project/:projectId/repository/t/:token" element={<Repository />} />
        <Route path="/project/:projectId/specifications/t/:token" element={<Specifications />} />
        <Route path="/project/:projectId/database/t/:token" element={<Database />} />
        <Route path="/project/:projectId/deploy/t/:token" element={<Deploy />} />
        
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </>
);

export default App;
