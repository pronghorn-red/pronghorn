import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { CreateProjectDialog } from "@/components/dashboard/CreateProjectDialog";
import { ProjectSetupWizard } from "@/components/requirements/ProjectSetupWizard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const mockProjects = [{ projectId: "1", projectName: "Enterprise Portal", lastUpdated: new Date(Date.now() - 1000 * 60 * 45), status: "BUILD" as const, coverage: 87 }];
const mockActivities = [{ id: "1", type: "build" as const, message: "Build completed", project: "Enterprise Portal", timestamp: new Date(), status: "success" as const }];

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [showWizard, setShowWizard] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      <main className="container px-6 py-8">
        <div className="flex justify-between mb-8">
          <div><h1 className="text-3xl font-bold mb-2">Projects</h1><p className="text-muted-foreground">Manage projects</p></div>
          <div className="flex gap-2">
            <Button onClick={() => setShowWizard(true)}><Sparkles className="h-4 w-4 mr-2" />Setup Wizard</Button>
            <CreateProjectDialog onCreateProject={() => toast.success("Created!")} />
          </div>
        </div>
        <div className="mb-6"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 max-w-md" /></div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">{mockProjects.map((p) => <ProjectCard key={p.projectId} {...p} onClick={(id) => navigate(`/project/${id}/canvas`)} />)}</div>
        <ActivityFeed activities={mockActivities} />
      </main>
      <ProjectSetupWizard open={showWizard} onClose={() => setShowWizard(false)} />
    </div>
  );
}
