import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useShareToken } from "@/hooks/useShareToken";
import { TokenRecoveryMessage } from "@/components/project/TokenRecoveryMessage";
import { useRealtimeArtifacts } from "@/hooks/useRealtimeArtifacts";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Search, Trash2, Edit2, Sparkles, LayoutGrid, List, ArrowUpDown, Users, Download, Grid3X3, Link2, X, ScanEye, Wand2 } from "lucide-react";
import { VisualRecognitionDialog } from "@/components/artifacts/VisualRecognitionDialog";
import { EnhanceImageDialog } from "@/components/artifacts/EnhanceImageDialog";
import { ArtifactDownloadDropdown } from "@/components/artifacts/ArtifactDownloadDropdown";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddArtifactModal } from "@/components/artifacts/AddArtifactModal";
import { ArtifactCollaborator } from "@/components/collaboration/ArtifactCollaborator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Badge } from "@/components/ui/badge";

export default function Artifacts() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet, tokenMissing } = useShareToken(projectId);
  const { user } = useAuth();
  const hasAccessToken = !!shareToken || !!user;
  const { artifacts, isLoading, addArtifact, updateArtifact, deleteArtifact, refresh, broadcastRefresh } = useRealtimeArtifacts(
    projectId,
    shareToken,
    hasAccessToken && isTokenSet
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [editingArtifact, setEditingArtifact] = useState<any>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table" | "gallery">("cards");
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [streamingSummary, setStreamingSummary] = useState<{ [key: string]: string }>({});
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [collaboratingArtifact, setCollaboratingArtifact] = useState<any>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [provenanceFilter, setProvenanceFilter] = useState<string | null>(null);
  const [deletingArtifact, setDeletingArtifact] = useState<{ id: string; title: string } | null>(null);
  const [isVisualRecognitionOpen, setIsVisualRecognitionOpen] = useState(false);
  const [isEnhanceImageOpen, setIsEnhanceImageOpen] = useState(false);

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

  const filteredAndSortedArtifacts = artifacts
    .filter((artifact) => {
      // Apply provenance filter if set
      if (provenanceFilter && artifact.provenance_id !== provenanceFilter) {
        return false;
      }
      // Apply search filter
      return (
        artifact.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        artifact.ai_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        artifact.ai_summary?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    })
    .sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

  // Filter for image artifacts only (for gallery view)
  const imageArtifacts = filteredAndSortedArtifacts.filter(a => !!a.image_url);

  const handleArtifactsCreated = () => {
    refresh();
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
    setStreamingSummary({ [artifact.id]: "" });
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
                setStreamingSummary(prev => ({ ...prev, [artifact.id]: fullSummary }));
                continue;
              }

              if (parsed.type === "done") {
                continue;
              }

              const content = parsed.choices?.[0]?.delta?.content || "";
              if (content) {
                fullSummary += content;
                setStreamingSummary(prev => ({ ...prev, [artifact.id]: fullSummary }));
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
                setStreamingSummary(prev => ({ ...prev, [artifact.id]: fullSummary }));
              } else if (!parsed.type && parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                fullSummary += content;
                setStreamingSummary(prev => ({ ...prev, [artifact.id]: fullSummary }));
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
      setStreamingSummary(prev => {
        const newState = { ...prev };
        delete newState[artifact.id];
        return newState;
      });
    } catch (error) {
      console.error("Error summarizing artifact:", error);
      toast.error("Failed to generate summary", { id: "summarize-artifact" });
      setStreamingSummary(prev => {
        const newState = { ...prev };
        delete newState[artifact.id];
        return newState;
      });
    } finally {
      setSummarizingId(null);
    }
  };

  const handleEditClick = (artifact: any) => {
    setEditingArtifact(artifact);
    setEditingTitle(artifact.ai_title || "");
  };

  const handleShowRelated = (provenanceId: string) => {
    setProvenanceFilter(provenanceId);
  };

  const clearProvenanceFilter = () => {
    setProvenanceFilter(null);
  };

  if (tokenMissing) {
    return (
      <div className="min-h-screen bg-background">
        <PrimaryNav />
        <TokenRecoveryMessage />
      </div>
    );
  }

  // Collaboration sub-view
  if (collaboratingArtifact) {
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <PrimaryNav />
        <div className="flex flex-1 relative min-h-0">
          <ProjectSidebar projectId={projectId!} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
          <main className="flex-1 min-h-0 overflow-hidden">
            <ArtifactCollaborator
              projectId={projectId!}
              artifact={collaboratingArtifact}
              shareToken={shareToken}
              onBack={() => setCollaboratingArtifact(null)}
              onMerged={refresh}
            />
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
              title="Artifacts"
              subtitle="Manage reusable knowledge blocks and documentation"
              onMenuClick={() => setIsSidebarOpen(true)}
            />
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search artifacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {/* Provenance filter indicator */}
                  {provenanceFilter && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={clearProvenanceFilter}
                      className="gap-1"
                    >
                      <Link2 className="h-3 w-3" />
                      Showing related
                      <X className="h-3 w-3 ml-1" />
                    </Button>
                  )}
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
                    <Button
                      variant={viewMode === "gallery" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("gallery")}
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </Button>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
                        >
                          <ArrowUpDown className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {sortOrder === "newest" ? "Newest First" : "Oldest First"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="outline" onClick={() => setIsVisualRecognitionOpen(true)}>
                    <ScanEye className="h-4 w-4 mr-2" />
                    Visual Recognition
                  </Button>
                  <Button variant="outline" onClick={() => setIsEnhanceImageOpen(true)}>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Create/Enhance Image
                  </Button>
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Artifact
                  </Button>
                  <AddArtifactModal
                    open={isAddDialogOpen}
                    onOpenChange={setIsAddDialogOpen}
                    projectId={projectId!}
                    shareToken={shareToken}
                    onArtifactsCreated={handleArtifactsCreated}
                    addArtifact={addArtifact}
                    broadcastRefresh={broadcastRefresh}
                  />
                  <VisualRecognitionDialog
                    open={isVisualRecognitionOpen}
                    onOpenChange={setIsVisualRecognitionOpen}
                    artifacts={artifacts}
                    projectId={projectId!}
                    shareToken={shareToken}
                    onComplete={refresh}
                  />
                  <EnhanceImageDialog
                    open={isEnhanceImageOpen}
                    onOpenChange={setIsEnhanceImageOpen}
                    artifacts={artifacts}
                    projectId={projectId!}
                    shareToken={shareToken}
                    onComplete={refresh}
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading artifacts...</div>
              ) : filteredAndSortedArtifacts.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <p className="text-muted-foreground">
                      {searchQuery ? "No artifacts match your search" : provenanceFilter ? "No related artifacts found" : "No artifacts yet"}
                    </p>
                  </CardContent>
                </Card>
              ) : viewMode === "gallery" ? (
                // Gallery View - Masonry layout for image artifacts
                imageArtifacts.length === 0 ? (
                  <Card>
                    <CardContent className="text-center py-12">
                      <p className="text-muted-foreground">No image artifacts to display in gallery</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                    {imageArtifacts.map((artifact) => (
                      <div 
                        key={artifact.id}
                        className="break-inside-avoid rounded-lg overflow-hidden border bg-card hover:ring-2 hover:ring-primary/50 transition-all group relative cursor-pointer"
                        onClick={() => setPreviewImage({ url: artifact.image_url!, title: artifact.ai_title || "" })}
                      >
                        <img 
                          src={artifact.image_url!} 
                          alt={artifact.ai_title || "Artifact"}
                          className="w-full h-auto"
                        />
                        {/* Hover overlay with title and actions */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 pointer-events-none">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium truncate">
                                {artifact.ai_title || "Untitled"}
                              </p>
                              {artifact.provenance_page && artifact.provenance_total_pages && (
                                <p className="text-white/70 text-xs">
                                  Page {artifact.provenance_page} of {artifact.provenance_total_pages}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0 pointer-events-auto">
                              {artifact.provenance_id && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-white hover:bg-white/20"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleShowRelated(artifact.provenance_id!);
                                        }}
                                      >
                                        <Link2 className="h-3 w-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Show Related Pages</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-white hover:bg-white/20"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeletingArtifact({ id: artifact.id, title: artifact.ai_title || "Untitled" });
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : viewMode === "cards" ? (
                <div className="space-y-4">
                  {filteredAndSortedArtifacts.map((artifact) => (
                    <Card key={artifact.id}>
                      <CardHeader>
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <CardTitle className="text-lg break-words">
                                {artifact.ai_title || "Untitled Artifact"}
                              </CardTitle>
                              {artifact.provenance_page && artifact.provenance_total_pages && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  Page {artifact.provenance_page}/{artifact.provenance_total_pages}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Created {format(new Date(artifact.created_at), "PPp")}
                              {artifact.provenance_path && (
                                <span className="ml-2 text-muted-foreground/70">
                                  • From: {artifact.provenance_path}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1 shrink-0">
                            <TooltipProvider>
                              {artifact.provenance_id && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleShowRelated(artifact.provenance_id!)}
                                    >
                                      <Link2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Show Related Pages</TooltipContent>
                                </Tooltip>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setCollaboratingArtifact(artifact)}
                                  >
                                    <Users className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Collaborate</TooltipContent>
                              </Tooltip>
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
                                  <ArtifactDownloadDropdown
                                    title={artifact.ai_title || "Artifact"}
                                    content={artifact.content}
                                    aiSummary={artifact.ai_summary}
                                  />
                                </TooltipTrigger>
                                <TooltipContent>Download</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setDeletingArtifact({ id: artifact.id, title: artifact.ai_title || "Untitled" })}
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
                      <CardContent className="space-y-4">
                        {/* Split layout when both image and text content exist */}
                        {artifact.image_url && artifact.content?.trim() ? (
                          <div className="flex flex-col md:flex-row gap-4">
                            {/* Text column - takes remaining space with min width */}
                            <div className="flex-1 min-w-0 md:min-w-[300px]">
                              <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md h-[300px] overflow-y-auto">
                                {artifact.content}
                              </pre>
                            </div>
                            {/* Image column - dynamic width, fixed height */}
                            <div 
                              className="shrink-0 rounded-lg border overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all h-[300px] flex items-center justify-center"
                              onClick={() => setPreviewImage({ 
                                url: artifact.image_url!, 
                                title: artifact.ai_title || "Artifact image" 
                              })}
                            >
                              <img 
                                src={artifact.image_url} 
                                alt={artifact.ai_title || "Artifact image"}
                                className="h-full w-auto object-contain"
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Image only layout */}
                            {artifact.image_url && (
                              <div 
                                className="rounded-lg border overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                                onClick={() => setPreviewImage({ 
                                  url: artifact.image_url!, 
                                  title: artifact.ai_title || "Artifact image" 
                                })}
                              >
                                <img 
                                  src={artifact.image_url} 
                                  alt={artifact.ai_title || "Artifact image"}
                                  className="w-full h-auto object-contain max-h-64"
                                />
                              </div>
                            )}
                            {/* Text only layout */}
                            {artifact.content?.trim() && (
                              <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md max-h-64 overflow-y-auto">
                                {artifact.content}
                              </pre>
                            )}
                          </>
                        )}
                        {(artifact.ai_summary || streamingSummary[artifact.id]) && (
                          <Accordion type="single" collapsible defaultValue="summary">
                            <AccordionItem value="summary" className="border-none">
                              <AccordionTrigger className="text-sm font-semibold py-2">
                                AI Summary
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {streamingSummary[artifact.id] || artifact.ai_summary}
                                  </ReactMarkdown>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        )}
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
                        <TableHead className="w-[140px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedArtifacts.map((artifact) => (
                        <TableRow key={artifact.id}>
                          <TableCell className="font-medium">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span>{artifact.ai_title || "Untitled Artifact"}</span>
                                {artifact.provenance_page && artifact.provenance_total_pages && (
                                  <Badge variant="secondary" className="text-xs">
                                    {artifact.provenance_page}/{artifact.provenance_total_pages}
                                  </Badge>
                                )}
                              </div>
                              {artifact.image_url && (
                                <img 
                                  src={artifact.image_url} 
                                  alt={artifact.ai_title || "Artifact image"}
                                  className="w-32 h-auto object-contain rounded border cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                                  onClick={() => setPreviewImage({ 
                                    url: artifact.image_url!, 
                                    title: artifact.ai_title || "Artifact image" 
                                  })}
                                />
                              )}
                            </div>
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
                                {artifact.provenance_id && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handleShowRelated(artifact.provenance_id!)}
                                      >
                                        <Link2 className="h-3 w-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Show Related</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => setCollaboratingArtifact(artifact)}
                                    >
                                      <Users className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Collaborate</TooltipContent>
                                </Tooltip>
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
                                    <ArtifactDownloadDropdown
                                      title={artifact.ai_title || "Artifact"}
                                      content={artifact.content}
                                      aiSummary={artifact.ai_summary}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>Download</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => setDeletingArtifact({ id: artifact.id, title: artifact.ai_title || "Untitled" })}
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

      {/* Image Preview Modal */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] p-4">
            <DialogHeader>
              <DialogTitle>{previewImage.title}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center overflow-auto max-h-[80vh]">
              <img 
                src={previewImage.url} 
                alt={previewImage.title}
                className="max-w-full max-h-[75vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingArtifact} onOpenChange={(open) => !open && setDeletingArtifact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Artifact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingArtifact?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingArtifact) {
                  deleteArtifact(deletingArtifact.id);
                  setDeletingArtifact(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
