import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { RequirementsTree, RequirementType } from "@/components/requirements/RequirementsTree";
import { AIDecomposeDialog } from "@/components/requirements/AIDecomposeDialog";
import { LinkStandardsDialog } from "@/components/requirements/LinkStandardsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, ChevronsDown, ChevronsUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useParams } from "react-router-dom";
import { useRealtimeRequirements } from "@/hooks/useRealtimeRequirements";
import { useShareToken } from "@/hooks/useShareToken";
import { TokenRecoveryMessage } from "@/components/project/TokenRecoveryMessage";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function Requirements() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet, tokenMissing } = useShareToken(projectId);
  const { user } = useAuth();
  const hasAccessToken = !!shareToken || !!user;
  const { requirements, isLoading, addRequirement, updateRequirement, deleteRequirement, refresh } = useRealtimeRequirements(
    projectId!,
    shareToken || null,
    hasAccessToken
  );
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [linkReq, setLinkReq] = useState<{ id: string; title: string } | null>(null);
  const [expandAll, setExpandAll] = useState<boolean | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Log projectId for debugging
  console.log("Requirements page - projectId:", projectId);

  if (!projectId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-destructive">Invalid project ID</p>
      </div>
    );
  }

  // Show token recovery message if tokenMissing
  if (tokenMissing) {
    return (
      <div className="min-h-screen bg-background">
        <PrimaryNav />
        <TokenRecoveryMessage />
      </div>
    );
  }

  // If user is anonymous and no share token is present, block access
  if (!hasAccessToken) {
    return (
      <div className="min-h-screen bg-background">
        <PrimaryNav />
        <div className="flex relative">
          <ProjectSidebar projectId={projectId} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
          <main className="flex-1 w-full flex items-center justify-center">
            <div className="text-center space-y-2 max-w-md px-4">
              <h1 className="text-xl font-semibold">Share token required</h1>
              <p className="text-sm text-muted-foreground">
                This project can only be accessed via its secure sharing link. Please use the full URL that includes the <code>/t/token</code> path segment.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Wait for token to be set before loading data
  if (shareToken && !isTokenSet) {
    return (
      <div className="min-h-screen bg-background">
        <PrimaryNav />
        <div className="flex relative">
          <ProjectSidebar projectId={projectId} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
          <main className="flex-1 w-full flex items-center justify-center">
            <p>Loading...</p>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
        <main className="flex-1 overflow-auto w-full">
          <div className="px-4 md:px-6 py-6 md:py-8">
            <ProjectPageHeader
              title="Requirements"
              onMenuClick={() => setIsSidebarOpen(true)}
            />
            <div className="flex flex-col md:flex-row gap-2 md:gap-3 mb-6">
              <div className="relative flex-1 md:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." className="pl-9 text-sm md:text-base" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAIDialog(true)} className="flex-1 md:flex-none text-sm">
                  AI Decompose
                </Button>
                <Button onClick={() => addRequirement(null, "EPIC", "New Epic")} className="flex-1 md:flex-none text-sm">
                  <Plus className="h-3 w-3 md:h-4 md:w-4 mr-2" />
                  Add Epic
                </Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => setExpandAll(prev => prev === true ? false : true)}
                      >
                        {expandAll ? <ChevronsUp className="h-4 w-4" /> : <ChevronsDown className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {expandAll ? "Collapse All" : "Expand All"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            {isLoading ? <p className="text-center py-12 text-muted-foreground">Loading...</p> : requirements.length > 0 ? (
              <div className="bg-card border rounded-lg p-4">
                <RequirementsTree 
                  requirements={requirements} 
                  projectId={projectId!} 
                  shareToken={shareToken}
                  expandAll={expandAll}
                  onNodeUpdate={(id, u) => {
                    updateRequirement(id, u).then(() => toast.success("Updated"));
                  }} 
                  onNodeDelete={(id) => {
                    deleteRequirement(id).then(() => toast.success("Deleted"));
                  }} 
                  onNodeAdd={(p, t) => {
                    addRequirement(p, t, `New ${t}`).then(() => toast.success("Added"));
                  }} 
                  onExpand={refresh} 
                  onLinkStandard={(id, title) => setLinkReq({ id, title })} 
                />
              </div>
            ) : <div className="text-center py-12"><p className="text-muted-foreground mb-4">No requirements yet</p><Button onClick={() => addRequirement(null, "EPIC", "First Epic")}><Plus className="h-4 w-4 mr-2" />Add First Epic</Button></div>}
          </div>
        </main>
      </div>
      <AIDecomposeDialog open={showAIDialog} onClose={() => setShowAIDialog(false)} projectId={projectId} shareToken={shareToken} onRefresh={refresh} />
      {linkReq && <LinkStandardsDialog open={!!linkReq} onClose={() => setLinkReq(null)} requirementId={linkReq.id} requirementTitle={linkReq.title} shareToken={shareToken} />}
    </div>
  );
}
