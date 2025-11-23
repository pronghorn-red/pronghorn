import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useShareToken } from "@/hooks/useShareToken";
import { useRealtimeArtifacts } from "@/hooks/useRealtimeArtifacts";
import { Plus, Search, Trash2, Edit2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Artifacts() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const { artifacts, isLoading, addArtifact, updateArtifact, deleteArtifact } = useRealtimeArtifacts(
    projectId,
    shareToken,
    isTokenSet
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [editingArtifact, setEditingArtifact] = useState<any>(null);
  const [newContent, setNewContent] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const filteredArtifacts = artifacts.filter((artifact) =>
    (artifact.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artifact.ai_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artifact.ai_summary?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleAddArtifact = async () => {
    if (!newContent.trim()) return;
    await addArtifact(newContent, "manual");
    setNewContent("");
    setIsAddDialogOpen(false);
  };

  const handleUpdateArtifact = async () => {
    if (!editingArtifact) return;
    await updateArtifact(editingArtifact.id, editingArtifact.content);
    setEditingArtifact(null);
  };

  const handleSummarize = async (artifact: any) => {
    try {
      const { data, error } = await supabase.functions.invoke("summarize-artifact", {
        body: { artifactId: artifact.id, shareToken }
      });

      if (error) throw error;
      toast.success("Artifact summarized successfully");
    } catch (error) {
      console.error("Error summarizing artifact:", error);
      toast.error("Failed to summarize artifact");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} />

        <main className="flex-1 w-full">
          <div className="container px-6 py-8 max-w-6xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Artifacts</h2>
                  <p className="text-muted-foreground">
                    Reusable knowledge blocks for your project
                  </p>
                </div>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Artifact
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Add New Artifact</DialogTitle>
                      <DialogDescription>
                        Create a reusable knowledge block for your project
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      placeholder="Paste or type your artifact content here..."
                      rows={12}
                      className="resize-none"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddArtifact}>Create Artifact</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search artifacts by content, title, or summary..."
                  className="pl-9"
                />
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading artifacts...</div>
              ) : filteredArtifacts.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <p className="text-muted-foreground">
                      {searchQuery ? "No artifacts match your search" : "No artifacts yet"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {filteredArtifacts.map((artifact) => (
                    <Card key={artifact.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <CardTitle className="text-lg">
                              {artifact.ai_title || "Untitled Artifact"}
                            </CardTitle>
                            {artifact.ai_summary && (
                              <CardDescription>{artifact.ai_summary}</CardDescription>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Created {format(new Date(artifact.created_at), "PPp")}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSummarize(artifact)}
                            >
                              <Sparkles className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingArtifact(artifact)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteArtifact(artifact.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md max-h-64 overflow-y-auto">
                          {artifact.content}
                        </pre>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {editingArtifact && (
        <Dialog open={!!editingArtifact} onOpenChange={() => setEditingArtifact(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Artifact</DialogTitle>
            </DialogHeader>
            <Textarea
              value={editingArtifact.content}
              onChange={(e) =>
                setEditingArtifact({ ...editingArtifact, content: e.target.value })
              }
              rows={12}
              className="resize-none"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditingArtifact(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateArtifact}>Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
