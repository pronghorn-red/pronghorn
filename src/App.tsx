import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Standards from "./pages/Standards";
import TechStacks from "./pages/TechStacks";
import Settings from "./pages/Settings";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import License from "./pages/License";
import Requirements from "./pages/project/Requirements";
import ProjectStandards from "./pages/project/Standards";
import Canvas from "./pages/project/Canvas";
import Audit from "./pages/project/Audit";
import Build from "./pages/project/Build";
import Repository from "./pages/project/Repository";
import ProjectSettings from "./pages/project/ProjectSettings";
import Specifications from "./pages/project/Specifications";
import Deploy from "./pages/project/Deploy";
import Database from "./pages/project/Database";
import NotFound from "./pages/NotFound";
import Artifacts from "./pages/project/Artifacts";
import Chat from "./pages/project/Chat";

const App = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/auth" element={<Auth />} />
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/standards" element={<Standards />} />
    <Route path="/tech-stacks" element={<TechStacks />} />
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
);

export default App;
