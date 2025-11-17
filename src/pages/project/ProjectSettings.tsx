import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { TechStackSelector } from "@/components/standards/TechStackSelector";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layers } from "lucide-react";

export default function ProjectSettings() {
  const { projectId } = useParams<{ projectId: string }>();
  const [showTechStacks, setShowTechStacks] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <div className="flex">
        <ProjectSidebar projectId={projectId!} />

        <main className="flex-1">
          <div className="container px-6 py-8 max-w-4xl">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Project Settings</h2>
                <p className="text-muted-foreground">Configure your project settings and integrations</p>
              </div>

              <div className="space-y-6 border-t pt-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Tech Stack</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Select tech stacks to automatically link relevant standards to your project. Standards are linked dynamically, so changes to standards will automatically apply to all linked projects.
                  </p>
                  <Button onClick={() => setShowTechStacks(true)}>
                    <Layers className="h-4 w-4 mr-2" />
                    Manage Tech Stacks
                  </Button>
                </div>

                <div className="space-y-4 border-t pt-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Project Name</Label>
                    <Input id="name" defaultValue="Enterprise Portal" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input id="description" defaultValue="Enterprise management portal" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="repo">GitHub Repository</Label>
                    <Input id="repo" placeholder="owner/repo" />
                  </div>

                  <Button>Save Changes</Button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <TechStackSelector projectId={projectId!} open={showTechStacks} onClose={() => setShowTechStacks(false)} />
    </div>
  );
}
