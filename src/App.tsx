import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Standards from "./pages/Standards";
import TechStacks from "./pages/TechStacks";
import Settings from "./pages/Settings";
import Requirements from "./pages/project/Requirements";
import Canvas from "./pages/project/Canvas";
import Audit from "./pages/project/Audit";
import Build from "./pages/project/Build";
import Repository from "./pages/project/Repository";
import ProjectSettings from "./pages/project/ProjectSettings";
import Specifications from "./pages/project/Specifications";
import NotFound from "./pages/NotFound";

const App = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/standards" element={<Standards />} />
    <Route path="/tech-stacks" element={<TechStacks />} />
    <Route path="/settings/organization" element={<Settings />} />
    <Route path="/settings/profile" element={<Settings />} />
    
    {/* Project Routes */}
    <Route path="/project/:projectId/requirements" element={<Requirements />} />
    <Route path="/project/:projectId/canvas" element={<Canvas />} />
    <Route path="/project/:projectId/audit" element={<Audit />} />
    <Route path="/project/:projectId/build" element={<Build />} />
    <Route path="/project/:projectId/repository" element={<Repository />} />
    <Route path="/project/:projectId/specifications" element={<Specifications />} />
    <Route path="/project/:projectId/settings" element={<ProjectSettings />} />
    
    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default App;
