import { useState, useMemo, useCallback } from "react";
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
import { useRealtimeArtifacts, buildArtifactHierarchy } from "@/hooks/useRealtimeArtifacts";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Search, Trash2, Edit2, Sparkles, LayoutGrid, List, ArrowUpDown, Users, Download, Grid3X3, Link2, X, ScanEye, Wand2, Copy, FolderPlus, TreePine, Folder, ChevronRight, PanelLeftClose, PanelLeft, Eye, Globe, ExternalLink, Check, Share2, Code } from "lucide-react";
import Editor from "@monaco-editor/react";
import { ShareArtifactDialog } from "@/components/artifacts/ShareArtifactDialog";
import { CreateFolderDialog } from "@/components/artifacts/CreateFolderDialog";
import { MoveArtifactDialog } from "@/components/artifacts/MoveArtifactDialog";
import { ArtifactTreeManager } from "@/components/artifacts/ArtifactTreeManager";
import { ArtifactFolderSidebar } from "@/components/artifacts/ArtifactFolderSidebar";
import { Artifact } from "@/hooks/useRealtimeArtifacts";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export default function Artifacts() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet, tokenMissing } = useShareToken(projectId);
  const { user } = useAuth();
  const hasAccessToken = !!shareToken || !!user;
  const { artifacts, artifactTree, isLoading, addArtifact, addFolder, moveArtifact, renameFolder, updateArtifact, updatePublishedStatus, deleteArtifact, deleteFolder, refresh, broadcastRefresh } = useRealtimeArtifacts(
    projectId,
    shareToken,
    hasAccessToken && isTokenSet
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [editingArtifact, setEditingArtifact] = useState<any>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table" | "gallery" | "tree">("cards");
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [movingArtifact, setMovingArtifact] = useState<Artifact | null>(null);
  const [addArtifactParentId, setAddArtifactParentId] = useState<string | null>(null);
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
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showFolderSidebar, setShowFolderSidebar] = useState(true);
  const [viewingArtifact, setViewingArtifact] = useState<Artifact | null>(null);
  const [editViewMode, setEditViewMode] = useState<"raw" | "markdown" | "source" | "html">("raw");
  const [sharingArtifact, setSharingArtifact] = useState<Artifact | null>(null);

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

  // Filter artifacts based on selected folder and search
  const filteredAndSortedArtifacts = useMemo(() => {
    return artifacts
      .filter((artifact) => {
        // Filter out folders from non-tree views
        if (artifact.is_folder) return false;
        
        // Filter by selected folder
        if (selectedFolderId !== null) {
          if (artifact.parent_id !== selectedFolderId) return false;
        }
        
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
  }, [artifacts, selectedFolderId, provenanceFilter, searchQuery, sortOrder]);

  // Get the current folder for breadcrumb
  const currentFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    return artifacts.find(a => a.id === selectedFolderId);
  }, [artifacts, selectedFolderId]);

  // Get folder path for breadcrumb
  const folderPath = useMemo(() => {
    if (!selectedFolderId) return [];
    const path: Artifact[] = [];
    let current = artifacts.find(a => a.id === selectedFolderId);
    while (current) {
      path.unshift(current);
      current = current.parent_id ? artifacts.find(a => a.id === current!.parent_id) : undefined;
    }
    return path;
  }, [artifacts, selectedFolderId]);

  // Filter for image artifacts only (for gallery view)
  const imageArtifacts = filteredAndSortedArtifacts.filter(a => !!a.image_url);

  // Handle drag and drop
  const handleDropArtifact = async (artifactId: string, targetFolderId: string | null) => {
    try {
      await moveArtifact(artifactId, targetFolderId);
    } catch (error) {
      // Error already handled in hook
    }
  };

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

  const handleCloneArtifact = async (artifact: typeof artifacts[0]) => {
    try {
      await addArtifact(
        artifact.content,
        artifact.source_type || undefined,
        artifact.source_id || undefined,
        artifact.image_url || undefined
      );
      toast.success("Artifact cloned successfully");
    } catch (error) {
      console.error("Error cloning artifact:", error);
      toast.error("Failed to clone artifact");
    }
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
            <div className="space-y-4">
              {/* Search and controls */}
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search artifacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  {/* Provenance filter indicator */}
                  {provenanceFilter && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={clearProvenanceFilter}
                      className="gap-1"
                    >
                      <Link2 className="h-3 w-3" />
                      <span className="hidden sm:inline">Showing related</span>
                      <X className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                  <div className="flex border rounded-md">
                    <Button
                      variant={viewMode === "tree" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("tree")}
                      title="Tree view"
                    >
                      <TreePine className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "cards" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("cards")}
                      title="Card view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "table" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("table")}
                      title="Table view"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "gallery" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("gallery")}
                      title="Gallery view"
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button variant="outline" size="icon" className="md:hidden" onClick={() => { setCreateFolderParentId(null); setIsCreateFolderOpen(true); }} title="Create Folder">
                    <FolderPlus className="h-4 w-4" />
                  </Button>
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="md:hidden" onClick={() => setIsVisualRecognitionOpen(true)}>
                          <ScanEye className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Visual Recognition</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="md:hidden" onClick={() => setIsEnhanceImageOpen(true)}>
                          <Wand2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Create/Enhance Image</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" className="md:hidden" onClick={() => setIsAddDialogOpen(true)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Add Artifact</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {/* Desktop buttons with text */}
                  <Button variant="outline" className="hidden md:flex" onClick={() => setIsVisualRecognitionOpen(true)}>
                    <ScanEye className="h-4 w-4 mr-2" />
                    Visual Recognition
                  </Button>
                  <Button variant="outline" className="hidden md:flex" onClick={() => setIsEnhanceImageOpen(true)}>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Create/Enhance Image
                  </Button>
                  <Button variant="outline" className="hidden md:flex" onClick={() => { setCreateFolderParentId(null); setIsCreateFolderOpen(true); }}>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Create Folder
                  </Button>
                  <Button className="hidden md:flex" onClick={() => { setAddArtifactParentId(null); setIsAddDialogOpen(true); }}>
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

              {/* Breadcrumb - always visible for consistent layout */}
              <div className="flex items-center gap-1 text-sm min-h-[24px]">
                <Button
                  variant="link"
                  size="sm"
                  className={cn(
                    "h-auto p-0",
                    selectedFolderId === null && !viewingArtifact
                      ? "text-foreground font-medium" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => { setSelectedFolderId(null); setViewingArtifact(null); }}
                >
                  All Artifacts
                </Button>
                {folderPath.map((folder, index) => (
                  <div key={folder.id} className="flex items-center gap-1">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <Button
                      variant="link"
                      size="sm"
                      className={cn(
                        "h-auto p-0",
                        index === folderPath.length - 1 && !viewingArtifact
                          ? "text-foreground font-medium" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => { setSelectedFolderId(folder.id); setViewingArtifact(null); }}
                    >
                      {folder.ai_title || "Untitled Folder"}
                    </Button>
                  </div>
                ))}
                {viewingArtifact && (
                  <div className="flex items-center gap-1">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <span className="text-foreground font-medium">
                      {viewingArtifact.ai_title || "Untitled Artifact"}
                    </span>
                  </div>
                )}
              </div>

              {/* Main content with folder sidebar */}
              <div className="flex gap-4">
                {/* Folder sidebar - hidden on mobile and in tree view */}
                {showFolderSidebar && viewMode !== "tree" && (
                  <div className="hidden md:block">
                    <ArtifactFolderSidebar
                      artifacts={artifacts}
                      selectedFolderId={selectedFolderId}
                      onSelectFolder={(id) => { setSelectedFolderId(id); setViewingArtifact(null); }}
                      onCreateFolder={(parentId) => { setCreateFolderParentId(parentId); setIsCreateFolderOpen(true); }}
                      onDropArtifact={handleDropArtifact}
                      onRenameFolder={(folderId, newName) => renameFolder(folderId, newName)}
                      onDeleteFolder={deleteFolder}
                      onViewArtifact={setViewingArtifact}
                    />
                  </div>
                )}

                {/* Toggle sidebar button */}
                {viewMode !== "tree" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden md:flex absolute left-4 top-1/2 z-10 h-8 w-8"
                    onClick={() => setShowFolderSidebar(!showFolderSidebar)}
                    title={showFolderSidebar ? "Hide folders" : "Show folders"}
                  >
                    {showFolderSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
                  </Button>
                )}

                {/* Content area */}
                <div className="flex-1 min-w-0">
                  {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading artifacts...</div>
                  ) : viewingArtifact ? (
                    /* Inline artifact view */
                    <Card>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 flex-1 min-w-0">
                            <CardTitle className="text-xl flex items-center gap-2">
                              <Eye className="h-5 w-5" />
                              {viewingArtifact.ai_title || "Untitled Artifact"}
                            </CardTitle>
                            {viewingArtifact.ai_summary && (
                              <CardDescription>{viewingArtifact.ai_summary}</CardDescription>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Created {format(new Date(viewingArtifact.created_at), "PPp")}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8"
                              title="Collaborate"
                              onClick={() => { setCollaboratingArtifact(viewingArtifact); setViewingArtifact(null); }}
                            >
                              <Users className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8"
                              title="AI Summarize"
                              disabled={summarizingId === viewingArtifact.id}
                              onClick={() => handleSummarize(viewingArtifact)}
                            >
                              <Sparkles className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8"
                              title="Edit"
                              onClick={() => { handleEditClick(viewingArtifact); setViewingArtifact(null); }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <ArtifactDownloadDropdown 
                              title={viewingArtifact.ai_title || "Untitled"}
                              content={viewingArtifact.content}
                              aiSummary={viewingArtifact.ai_summary}
                            />
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8"
                              title="Duplicate"
                              onClick={() => handleCloneArtifact(viewingArtifact)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className={cn(
                                "h-8 w-8",
                                viewingArtifact.is_published && "bg-green-500/20 text-green-600 hover:bg-green-500/30 hover:text-green-600"
                              )}
                              title="Share"
                              onClick={() => { setSharingArtifact(viewingArtifact); setViewingArtifact(null); }}
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="Delete"
                              onClick={() => { setDeletingArtifact({ id: viewingArtifact.id, title: viewingArtifact.ai_title || "Untitled" }); setViewingArtifact(null); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {viewingArtifact.image_url && (
                          <img 
                            src={viewingArtifact.image_url} 
                            alt={viewingArtifact.ai_title || ""}
                            className="max-w-full h-auto rounded-md mb-4 cursor-pointer hover:opacity-90"
                            onClick={() => setPreviewImage({ url: viewingArtifact.image_url!, title: viewingArtifact.ai_title || "" })}
                          />
                        )}
                        <ScrollArea className="max-h-[60vh]">
                          <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md">
                            {viewingArtifact.content}
                          </pre>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  ) : viewMode === "tree" ? (
                    <ArtifactTreeManager
                      artifacts={artifactTree}
                      onEdit={handleEditClick}
                      onDelete={(artifact) => setDeletingArtifact({ id: artifact.id, title: artifact.ai_title || "Untitled" })}
                      onMove={setMovingArtifact}
                      onCreateFolder={(parentId) => { setCreateFolderParentId(parentId); setIsCreateFolderOpen(true); }}
                      onRenameFolder={(folder, newName) => renameFolder(folder.id, newName)}
                      onSummarize={handleSummarize}
                      onCollaborate={setCollaboratingArtifact}
                      onClone={handleCloneArtifact}
                      onShowRelated={handleShowRelated}
                      onAddArtifact={(parentId) => { setAddArtifactParentId(parentId); setIsAddDialogOpen(true); }}
                      onImageClick={(url, title) => setPreviewImage({ url, title })}
                      onViewArtifact={setViewingArtifact}
                      onDropArtifact={handleDropArtifact}
                      summarizingId={summarizingId}
                    />
                  ) : filteredAndSortedArtifacts.length === 0 ? (
                    <Card>
                      <CardContent className="text-center py-12">
                        <p className="text-muted-foreground">
                          {searchQuery ? "No artifacts match your search" : selectedFolderId ? "This folder is empty" : provenanceFilter ? "No related artifacts found" : "No artifacts yet"}
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
                                    onClick={() => handleCloneArtifact(artifact)}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Clone Artifact</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      artifact.is_published && "bg-green-500/20 text-green-600 hover:bg-green-500/30 hover:text-green-600"
                                    )}
                                    onClick={() => setSharingArtifact(artifact)}
                                  >
                                    <Share2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Share Artifact</TooltipContent>
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
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Text column */}
                            <div className="min-w-0 overflow-hidden">
                              <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md h-48 md:h-64 overflow-y-auto">
                                {artifact.content}
                              </pre>
                            </div>
                            {/* Image column - contained within grid cell */}
                            <div 
                              className="rounded-lg border overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all h-48 md:h-64 flex items-center justify-center"
                              onClick={() => setPreviewImage({ 
                                url: artifact.image_url!, 
                                title: artifact.ai_title || "Artifact image" 
                              })}
                            >
                              <img 
                                src={artifact.image_url} 
                                alt={artifact.ai_title || "Artifact image"}
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Image only layout */}
                            {artifact.image_url && (
                              <div 
                                className="rounded-lg border overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all h-48 md:h-64 flex items-center justify-center"
                                onClick={() => setPreviewImage({ 
                                  url: artifact.image_url!, 
                                  title: artifact.ai_title || "Artifact image" 
                                })}
                              >
                                <img 
                                  src={artifact.image_url} 
                                  alt={artifact.ai_title || "Artifact image"}
                                  className="max-w-full max-h-full object-contain"
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
                                      onClick={() => handleCloneArtifact(artifact)}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Clone Artifact</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        "h-8 w-8",
                                        artifact.is_published && "bg-green-500/20 text-green-600 hover:bg-green-500/30 hover:text-green-600"
                                      )}
                                      onClick={() => setSharingArtifact(artifact)}
                                    >
                                      <Share2 className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Share Artifact</TooltipContent>
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
            </div>
          </div>
        </main>
      </div>

      {editingArtifact && (
        <Dialog open={!!editingArtifact} onOpenChange={() => {
          setEditingArtifact(null);
          setEditingTitle("");
          setEditViewMode("raw");
        }}>
          <DialogContent className="w-[calc(100vw-50px)] max-w-none h-[calc(100vh-50px)] flex flex-col p-0">
            <DialogHeader className="px-6 py-4 border-b shrink-0">
                <div className="flex items-center justify-between gap-4">
                <DialogTitle className="text-lg">Edit Artifact</DialogTitle>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-md border">
                    <Button
                      variant={editViewMode === "raw" ? "secondary" : "ghost"}
                      size="sm"
                      className="rounded-r-none border-r"
                      onClick={() => setEditViewMode("raw")}
                    >
                      <Edit2 className="h-3 w-3 md:mr-1" />
                      <span className="hidden md:inline">Raw</span>
                    </Button>
                    <Button
                      variant={editViewMode === "markdown" ? "secondary" : "ghost"}
                      size="sm"
                      className="rounded-none border-r"
                      onClick={() => setEditViewMode("markdown")}
                    >
                      <Eye className="h-3 w-3 md:mr-1" />
                      <span className="hidden md:inline">Markdown</span>
                    </Button>
                    <Button
                      variant={editViewMode === "source" ? "secondary" : "ghost"}
                      size="sm"
                      className="rounded-none border-r"
                      onClick={() => setEditViewMode("source")}
                    >
                      <Code className="h-3 w-3 md:mr-1" />
                      <span className="hidden md:inline">Source</span>
                    </Button>
                    <Button
                      variant={editViewMode === "html" ? "secondary" : "ghost"}
                      size="sm"
                      className="rounded-l-none"
                      onClick={() => setEditViewMode("html")}
                    >
                      <Globe className="h-3 w-3 md:mr-1" />
                      <span className="hidden md:inline">HTML</span>
                    </Button>
                  </div>
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 flex flex-col gap-4 p-6 overflow-hidden">
              <div className="space-y-2 shrink-0">
                <Label htmlFor="artifact-title">Title</Label>
                <Input
                  id="artifact-title"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  placeholder="Artifact title..."
                />
              </div>
              
              <div className="flex-1 flex flex-col min-h-0">
                <Label htmlFor="artifact-content" className="mb-2">Content</Label>
                {editViewMode === "raw" && (
                  <Textarea
                    id="artifact-content"
                    value={editingArtifact.content}
                    onChange={(e) =>
                      setEditingArtifact({ ...editingArtifact, content: e.target.value })
                    }
                    className="flex-1 resize-none font-mono text-sm"
                  />
                )}
                {editViewMode === "markdown" && (
                  <ScrollArea className="flex-1 border rounded-md p-4 bg-muted/30">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {editingArtifact.content}
                      </ReactMarkdown>
                    </div>
                  </ScrollArea>
                )}
                {editViewMode === "source" && (
                  <div className="flex-1 border rounded-md overflow-hidden">
                    <Editor
                      height="100%"
                      language="markdown"
                      value={editingArtifact.content}
                      onChange={(value) =>
                        setEditingArtifact({ ...editingArtifact, content: value || "" })
                      }
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: 'on',
                        folding: true,
                        wordWrap: 'on',
                        fontSize: 13,
                      }}
                      theme="vs-dark"
                    />
                  </div>
                )}
                {editViewMode === "html" && (
                  <div className="flex-1 border rounded-md overflow-hidden bg-white">
                    <iframe
                      srcDoc={(() => {
                        const content = editingArtifact.content;
                        const trimmed = content.trim().toLowerCase();
                        if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
                          return content;
                        }
                        return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; }
    </style>
  </head>
  <body>
    ${content}
  </body>
</html>`;
                      })()}
                      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
                      className="w-full h-full border-0"
                      title="HTML Preview"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end px-6 py-4 border-t shrink-0">
              <Button variant="outline" onClick={() => {
                setEditingArtifact(null);
                setEditingTitle("");
                setEditViewMode("raw");
              }}>
                Cancel
              </Button>
              <Button onClick={handleUpdateArtifact}>Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Artifact View Modal - removed, now inline */}

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

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={isCreateFolderOpen}
        onOpenChange={setIsCreateFolderOpen}
        onCreateFolder={async (name) => {
          await addFolder(name, createFolderParentId);
        }}
        parentFolderName={createFolderParentId ? artifacts.find(a => a.id === createFolderParentId)?.ai_title || undefined : undefined}
      />

      {/* Move Artifact Dialog */}
      <MoveArtifactDialog
        open={!!movingArtifact}
        onOpenChange={(open) => !open && setMovingArtifact(null)}
        artifact={movingArtifact}
        artifacts={artifacts}
        onMove={async (artifactId, newParentId) => {
          await moveArtifact(artifactId, newParentId);
        }}
      />

      {/* Share Artifact Dialog */}
      {sharingArtifact && (
        <ShareArtifactDialog
          open={!!sharingArtifact}
          onOpenChange={(open) => !open && setSharingArtifact(null)}
          artifact={sharingArtifact}
          onUpdatePublished={updatePublishedStatus}
        />
      )}
    </div>
  );
}
