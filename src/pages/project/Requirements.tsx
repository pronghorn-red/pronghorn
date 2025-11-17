import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { RequirementsTree, RequirementType } from "@/components/requirements/RequirementsTree";
import { AIDecomposeDialog } from "@/components/requirements/AIDecomposeDialog";
import { LinkStandardsDialog } from "@/components/requirements/LinkStandardsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { useParams } from "react-router-dom";
import { useRealtimeRequirements } from "@/hooks/useRealtimeRequirements";
import { toast } from "sonner";

export default function Requirements() {
  const { projectId } = useParams<{ projectId: string }>();
  const { requirements, isLoading, addRequirement, updateRequirement, deleteRequirement, refresh } = useRealtimeRequirements(projectId!);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [linkReq, setLinkReq] = useState<{ id: string; title: string } | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      <div className="flex">
        <ProjectSidebar projectId={projectId!} />
        <main className="flex-1 overflow-auto">
          <div className="container px-6 py-8 max-w-6xl">
            <h1 className="text-3xl font-bold mb-2">Requirements</h1>
            <div className="flex gap-3 mb-6">
              <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-9" /></div>
              <Button variant="outline" onClick={() => setShowAIDialog(true)}>AI Decompose</Button>
              <Button onClick={() => addRequirement(null, "EPIC", "New Epic")}><Plus className="h-4 w-4 mr-2" />Add Epic</Button>
            </div>
            {isLoading ? <p className="text-center py-12 text-muted-foreground">Loading...</p> : requirements.length > 0 ? (
              <div className="bg-card border rounded-lg p-4">
                <RequirementsTree requirements={requirements} projectId={projectId!} onNodeUpdate={(id, u) => updateRequirement(id, u).then(() => toast.success("Updated"))} onNodeDelete={(id) => deleteRequirement(id).then(() => toast.success("Deleted"))} onNodeAdd={(p, t) => addRequirement(p, t, `New ${t}`).then(() => toast.success("Added"))} onExpand={refresh} onLinkStandard={(id, title) => setLinkReq({ id, title })} />
              </div>
            ) : <div className="text-center py-12"><p className="text-muted-foreground mb-4">No requirements yet</p><Button onClick={() => addRequirement(null, "EPIC", "First Epic")}><Plus className="h-4 w-4 mr-2" />Add First Epic</Button></div>}
          </div>
        </main>
      </div>
      <AIDecomposeDialog open={showAIDialog} onClose={() => setShowAIDialog(false)} projectId={projectId!} />
      {linkReq && <LinkStandardsDialog open={!!linkReq} onClose={() => setLinkReq(null)} requirementId={linkReq.id} requirementTitle={linkReq.title} />}
    </div>
  );
}
