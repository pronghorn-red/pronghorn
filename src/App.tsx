import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { PageLoader } from "./components/PageLoader";
import { RequireSignupValidation } from "./components/auth/RequireSignupValidation";

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

// Helper to wrap components with signup validation
const withValidation = (Component: React.ComponentType) => (
  <RequireSignupValidation>
    <Component />
  </RequireSignupValidation>
);

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
const Present = lazy(() => import("./pages/project/Present"));

// Public viewer page (no auth required)
const Viewer = lazy(() => import("./pages/Viewer"));

const App = () => (
  <>
    <ScrollToTop />
    <PWAUpdatePrompt />
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes - no signup validation required */}
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/license" element={<License />} />
        
        {/* Public viewer routes - no authentication required */}
        <Route path="/viewer/:artifactId" element={<Viewer />} />
        <Route path="/viewer/:artifactId/raw" element={<Viewer />} />
        <Route path="/viewer/:artifactId/binary" element={<Viewer />} />
        
        {/* Protected routes - require signup validation */}
        <Route path="/dashboard" element={withValidation(Dashboard)} />
        <Route path="/gallery" element={withValidation(Gallery)} />
        <Route path="/standards" element={withValidation(Standards)} />
        <Route path="/tech-stacks" element={withValidation(TechStacks)} />
        <Route path="/build-books" element={withValidation(BuildBooks)} />
        <Route path="/build-books/new" element={withValidation(BuildBookEditor)} />
        <Route path="/build-books/:id" element={withValidation(BuildBookDetail)} />
        <Route path="/build-books/:id/edit" element={withValidation(BuildBookEditor)} />
        <Route path="/settings/organization" element={withValidation(Settings)} />
        <Route path="/settings/profile" element={withValidation(Settings)} />
        
        {/* Project Routes - Standard (authenticated users) */}
        <Route path="/project/:projectId/settings" element={withValidation(ProjectSettings)} />
        <Route path="/project/:projectId/artifacts" element={withValidation(Artifacts)} />
        <Route path="/project/:projectId/chat" element={withValidation(Chat)} />
        <Route path="/project/:projectId/requirements" element={withValidation(Requirements)} />
        <Route path="/project/:projectId/standards" element={withValidation(ProjectStandards)} />
        <Route path="/project/:projectId/canvas" element={withValidation(Canvas)} />
        <Route path="/project/:projectId/audit" element={withValidation(Audit)} />
        <Route path="/project/:projectId/build" element={withValidation(Build)} />
        <Route path="/project/:projectId/repository" element={withValidation(Repository)} />
        <Route path="/project/:projectId/specifications" element={withValidation(Specifications)} />
        <Route path="/project/:projectId/database" element={withValidation(Database)} />
        <Route path="/project/:projectId/deploy" element={withValidation(Deploy)} />
        <Route path="/project/:projectId/present" element={withValidation(Present)} />
        
        {/* Project Routes - With Token (shared access via path-based token) */}
        <Route path="/project/:projectId/settings/t/:token" element={withValidation(ProjectSettings)} />
        <Route path="/project/:projectId/artifacts/t/:token" element={withValidation(Artifacts)} />
        <Route path="/project/:projectId/chat/t/:token" element={withValidation(Chat)} />
        <Route path="/project/:projectId/requirements/t/:token" element={withValidation(Requirements)} />
        <Route path="/project/:projectId/standards/t/:token" element={withValidation(ProjectStandards)} />
        <Route path="/project/:projectId/canvas/t/:token" element={withValidation(Canvas)} />
        <Route path="/project/:projectId/audit/t/:token" element={withValidation(Audit)} />
        <Route path="/project/:projectId/build/t/:token" element={withValidation(Build)} />
        <Route path="/project/:projectId/repository/t/:token" element={withValidation(Repository)} />
        <Route path="/project/:projectId/specifications/t/:token" element={withValidation(Specifications)} />
        <Route path="/project/:projectId/database/t/:token" element={withValidation(Database)} />
        <Route path="/project/:projectId/deploy/t/:token" element={withValidation(Deploy)} />
        <Route path="/project/:projectId/present/t/:token" element={withValidation(Present)} />
        
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </>
);

export default App;
