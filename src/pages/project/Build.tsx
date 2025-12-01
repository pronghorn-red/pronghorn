import { useState } from "react";
import { useParams } from "react-router-dom";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StagingPanel } from "@/components/build/StagingPanel";
import { CommitHistory } from "@/components/build/CommitHistory";
import { Loader2 } from "lucide-react";

export default function Build() {
  const { projectId } = useParams();
  const [loading, setLoading] = useState(false);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex relative">
        <ProjectSidebar projectId={projectId} />
        
        <main className="flex-1 w-full">
          <div className="flex flex-col h-full">
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-14 items-center px-6">
                <h1 className="text-lg font-semibold">Build</h1>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <Tabs defaultValue="staging" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="staging">Staging</TabsTrigger>
                  <TabsTrigger value="history">Commit History</TabsTrigger>
                </TabsList>

                <TabsContent value="staging" className="mt-6">
                  <StagingPanel projectId={projectId} />
                </TabsContent>

                <TabsContent value="history" className="mt-6">
                  <CommitHistory projectId={projectId} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
