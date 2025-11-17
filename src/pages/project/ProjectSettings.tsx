import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams } from "react-router-dom";

export default function ProjectSettings() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex">
        <ProjectSidebar projectId={projectId!} />
        
        <main className="flex-1">
          <div className="container px-6 py-8">
            <h1 className="text-3xl font-bold mb-4">Project Settings</h1>
            <p className="text-muted-foreground">Project settings coming soon...</p>
          </div>
        </main>
      </div>
    </div>
  );
}
