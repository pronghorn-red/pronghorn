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
import { Plus, Search, Trash2, Edit2, Sparkles, LayoutGrid, List } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";

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
  const [editingTitle, setEditingTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [summarizingId, setSummarizingId] = useState<string | null>(null);

  // Fetch project settings for model configuration
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId && isTokenSet,
  });

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
    await updateArtifact(editingArtifact.id, editingArtifact.content, editingTitle || undefined);
    setEditingArtifact(null);
    setEditingTitle("");
  };

  const handleSummarize = async (artifact: any) => {
    if (summarizingId) return;

    setSummarizingId(artifact.id);
    toast.loading("Generating summary...", { id: "summarize-artifact" });

    try {
      const model = project?.selected_model || "gemini-2.5-flash";
      let edgeFunctionName = "chat-stream-gemini";

      if (model.startsWith("claude-")) {
        edgeFunctionName = "chat-stream-anthropic";
      } else if (model.startsWith("grok-")) {
        edgeFunctionName = "chat-stream-xai";
      }

      const systemPrompt = `You are a helpful assistant that creates clear, concise summaries of content.`;
      const userPrompt = `Please provide a summary of the following artifact content. Include a brief title (5-10 words) and a comprehensive summary (2-3 paragraphs) covering the key points. Format your response as:
TITLE: [Your title here]
SUMMARY: [Your summary here]

Content:
${artifact.content}`;

      const response = await fetch(`https://obkzdksfayygnrzdqoam.supabase.co/functions/v1/${edgeFunctionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8`,
        },
        body: JSON.stringify({
          systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          model: model,
          maxOutputTokens: 4096,
        }),
      });

      if (!response.ok) throw new Error("Failed to generate summary");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullSummary = "";

      if (reader) {
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "delta" && typeof parsed.text === "string") {
                fullSummary += parsed.text;
                continue;
              }

              if (parsed.type === "done") {
                continue;
              }

              const content = parsed.choices?.[0]?.delta?.content || "";
              if (content) {
                fullSummary += content;
              }
            } catch (e) {
              console.error("Error parsing stream line", e);
            }
          }
        }

        if (buffer.trim().startsWith("data: ")) {
          const data = buffer.trim().slice(6).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "delta" && typeof parsed.text === "string") {
                fullSummary += parsed.text;
              } else if (!parsed.type && parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                fullSummary += content;
              }
            } catch (e) {
              console.error("Error parsing final stream buffer", e);
            }
          }
        }
      }

      // Parse the summary to extract title and summary
      const titleMatch = fullSummary.match(/TITLE:\s*(.+?)(?:\n|$)/i);
      const summaryMatch = fullSummary.match(/SUMMARY:\s*(.+)/is);
      
      const aiTitle = titleMatch ? titleMatch[1].trim() : artifact.ai_title || "Artifact Summary";
      const aiSummary = summaryMatch ? summaryMatch[1].trim() : fullSummary;

      // Update artifact with summary
      await updateArtifact(artifact.id, undefined, aiTitle, aiSummary);
      
      toast.success("Summary generated successfully", { id: "summarize-artifact" });
    } catch (error) {
      console.error("Error summarizing artifact:", error);
      toast.error("Failed to generate summary", { id: "summarize-artifact" });
    } finally {
      setSummarizingId(null);
    }
  };

  const handleEditClick = (artifact: any) => {
    setEditingArtifact(artifact);
    setEditingTitle(artifact.ai_title || "");
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
                <div className="flex gap-2">
                  <div className="flex border rounded-md">
                    <Button
                      variant={viewMode === "cards" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("cards")}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "table" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("table")}
                    >
                      <List className="h-4 w-4" />
                    </Button>
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
              ) : viewMode === "cards" ? (
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
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleSummarize(artifact)}
                                    disabled={summarizingId === artifact.id}
                                  >
                                    <Sparkles className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Generate AI Summary</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditClick(artifact)}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit Artifact</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteArtifact(artifact.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete Artifact</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[300px]">Name</TableHead>
                        <TableHead>Preview</TableHead>
                        <TableHead className="w-[150px]">Created</TableHead>
                        <TableHead className="w-[120px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredArtifacts.map((artifact) => (
                        <TableRow key={artifact.id}>
                          <TableCell className="font-medium">
                            {artifact.ai_title || "Untitled Artifact"}
                          </TableCell>
                          <TableCell className="max-w-md">
                            <p className="text-sm text-muted-foreground truncate">
                              {artifact.content.slice(0, 150)}
                              {artifact.content.length > 150 ? "..." : ""}
                            </p>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(artifact.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleSummarize(artifact)}
                                      disabled={summarizingId === artifact.id}
                                    >
                                      <Sparkles className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Generate AI Summary</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleEditClick(artifact)}
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit Artifact</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => deleteArtifact(artifact.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete Artifact</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>

      {editingArtifact && (
        <Dialog open={!!editingArtifact} onOpenChange={() => {
          setEditingArtifact(null);
          setEditingTitle("");
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Artifact</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="artifact-title">Title</Label>
                <Input
                  id="artifact-title"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  placeholder="Artifact title..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="artifact-content">Content</Label>
                <Textarea
                  id="artifact-content"
                  value={editingArtifact.content}
                  onChange={(e) =>
                    setEditingArtifact({ ...editingArtifact, content: e.target.value })
                  }
                  rows={12}
                  className="resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => {
                setEditingArtifact(null);
                setEditingTitle("");
              }}>
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
