import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { CreateProjectDialog } from "@/components/dashboard/CreateProjectDialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

// Mock data
const mockProjects = [
  {
    projectId: "1",
    projectName: "Enterprise Portal",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 45),
    status: "BUILD" as const,
    coverage: 87,
  },
  {
    projectId: "2",
    projectName: "Customer Dashboard",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 3),
    status: "AUDIT" as const,
    coverage: 92,
  },
  {
    projectId: "3",
    projectName: "Mobile App API",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24),
    status: "DESIGN" as const,
  },
  {
    projectId: "4",
    projectName: "Analytics Platform",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    status: "BUILD" as const,
    coverage: 73,
  },
];

const mockActivities = [
  {
    id: "1",
    type: "build" as const,
    message: "Build completed successfully with 4 deployments",
    project: "Enterprise Portal",
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    status: "success" as const,
  },
  {
    id: "2",
    type: "audit" as const,
    message: "Audit run completed: 92% coverage achieved",
    project: "Customer Dashboard",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    status: "success" as const,
  },
  {
    id: "3",
    type: "standard" as const,
    message: "OWASP ASVS 4.0 standard linked to project",
    project: "Mobile App API",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
    status: "info" as const,
  },
  {
    id: "4",
    type: "build" as const,
    message: "Build failed: dependency conflict detected",
    project: "Analytics Platform",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    status: "error" as const,
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = mockProjects.filter((project) =>
    project.projectName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleProjectClick = (projectId: string) => {
    navigate(`/project/${projectId}/canvas`);
  };

  const handleCreateProject = (data: { name: string; description: string; file?: File }) => {
    // TODO: Implement actual project creation with Supabase
    toast.success("Project created successfully!");
    console.log("Creating project:", data);
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <main className="container px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Projects</h1>
            <p className="text-muted-foreground">
              Manage and monitor your application development projects
            </p>
          </div>
          <CreateProjectDialog onCreateProject={handleCreateProject} />
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.projectId}
              {...project}
              onClick={handleProjectClick}
            />
          ))}
        </div>

        {/* Activity Feed */}
        <ActivityFeed activities={mockActivities} />
      </main>
    </div>
  );
}
