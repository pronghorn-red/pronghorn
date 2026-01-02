import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { TokenRecoveryMessage } from "@/components/project/TokenRecoveryMessage";
import { useShareToken } from "@/hooks/useShareToken";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, RefreshCw, Trash2, Download, Loader2, Sparkles, Maximize2, Minimize2, FileDown, Bot, Palette, Pencil, ChevronLeft, ChevronRight, StickyNote, Save, PanelRightClose, PanelRight } from "lucide-react";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import { SlideThumbnails } from "@/components/present/SlideThumbnails";
import { FontScaleControl } from "@/components/present/FontScaleControl";
import { LayoutSelector } from "@/components/present/LayoutSelector";
import { SlideRenderer } from "@/components/present/SlideRenderer";
import { SlideImageGenerator, IMAGE_MODELS, IMAGE_STYLES } from "@/components/present/SlideImageGenerator";
import { PdfExportRenderer, PdfExportRendererRef } from "@/components/present/PdfExportRenderer";

// Layouts loaded from static JSON
const presentationLayoutsData = {
  layouts: [
    { id: "title-cover", name: "Title Cover", description: "Full-bleed cover", category: "title", regions: [] },
    { id: "section-divider", name: "Section Divider", description: "Bold section break", category: "divider", regions: [] },
    { id: "title-content", name: "Title + Content", description: "Header with content", category: "content", regions: [] },
    { id: "two-column", name: "Two Columns", description: "Side-by-side content", category: "content", regions: [] },
    { id: "image-left", name: "Image Left", description: "Image on left with content", category: "media", regions: [] },
    { id: "image-right", name: "Image Right", description: "Content with image on right", category: "media", regions: [] },
    { id: "stats-grid", name: "Statistics Grid", description: "4-cell metrics grid", category: "data", regions: [] },
    { id: "bullets", name: "Bullet Points", description: "Clean bullet list", category: "content", regions: [] },
    { id: "quote", name: "Quote", description: "Prominent quote", category: "accent", regions: [] },
    { id: "architecture", name: "Architecture", description: "Visual diagram", category: "technical", regions: [] },
    { id: "timeline", name: "Timeline", description: "Horizontal timeline", category: "content", regions: [] },
    { id: "icon-grid", name: "Icon Grid", description: "Grid of icons with labels", category: "content", regions: [] },
    { id: "table", name: "Data Table", description: "Tabular data", category: "data", regions: [] },
    { id: "comparison", name: "Comparison", description: "Side-by-side comparison", category: "content", regions: [] },
    { id: "chart-full", name: "Full Chart", description: "Large chart visualization", category: "data", regions: [] }
  ]
};

// Lightweight presentation metadata type (no slides/blackboard)
interface PresentationMeta {
  id: string;
  project_id: string;
  name: string;
  initial_prompt: string | null;
  mode: string;
  target_slides: number | null;
  status: string;
  slide_count: number;
  cover_image_url: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  version: number;
}

// Full presentation type
interface Presentation {
  id: string;
  project_id: string;
  name: string;
  initial_prompt: string | null;
  mode: string;
  target_slides: number | null;
  status: string;
  slides: Json;
  blackboard: Json;
  cover_image_url: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  version: number;
}

interface BlackboardEntry {
  id: string;
  timestamp: string;
  source: string;
  category: string;
  content: string;
  data?: any;
}

interface Layout {
  id: string;
  name: string;
  description: string;
  category: string;
  regions: any[];
}

export default function Present() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet, tokenMissing } = useShareToken(projectId || "");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // List of presentation metadata (lightweight)
  const [presentationsList, setPresentationsList] = useState<PresentationMeta[]>([]);
  // Full presentation data (loaded on demand)
  const [selectedPresentation, setSelectedPresentation] = useState<Presentation | null>(null);
  // Local working copy for edits (only saved on explicit save)
  const [workingSlides, setWorkingSlides] = useState<any[] | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingPresentation, setIsLoadingPresentation] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [liveBlackboard, setLiveBlackboard] = useState<BlackboardEntry[]>([]);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<"default" | "light" | "vibrant">("default");
  
  // Main page tabs: list, editor, blackboard
  const [activeTab, setActiveTab] = useState<"list" | "editor" | "blackboard">("list");
  
  // Right panel toggle for notes
  const [showNotesPanel, setShowNotesPanel] = useState(true);
  
  // Layouts from JSON
  const layouts: Layout[] = presentationLayoutsData.layouts;
  
  // Create dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("New Presentation");
  const [newMode, setNewMode] = useState<"concise" | "detailed">("concise");
  const [newTargetSlides, setNewTargetSlides] = useState(15);
  const [newPrompt, setNewPrompt] = useState("");
  const [newImageModel, setNewImageModel] = useState("gemini-2.5-flash-image");
  const [newImageStyle, setNewImageStyle] = useState("photorealistic");
  
  // PDF export state
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pdfExportRef = useRef<PdfExportRendererRef>(null);
  
  // Fullscreen edit mode
  const [showEditControls, setShowEditControls] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Load presentations list (lightweight - metadata only)
  useEffect(() => {
    const loadPresentationsList = async () => {
      if (!projectId || !isTokenSet) return;
      setIsLoadingList(true);
      
      try {
        const { data, error } = await supabase.rpc("get_project_presentations_list_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
        });
        
        if (error) throw error;
        setPresentationsList((data || []) as PresentationMeta[]);
      } catch (err: any) {
        console.error("Error loading presentations list:", err);
        toast.error("Failed to load presentations");
      } finally {
        setIsLoadingList(false);
      }
    };
    
    loadPresentationsList();
  }, [projectId, shareToken, isTokenSet]);

  // Sync workingSlides when selectedPresentation changes
  useEffect(() => {
    if (selectedPresentation) {
      setWorkingSlides(getSlides(selectedPresentation));
      setHasUnsavedChanges(false);
    } else {
      setWorkingSlides(null);
    }
  }, [selectedPresentation]);

  // Load full presentation data when selecting one
  const loadFullPresentation = async (presentationId: string) => {
    if (!shareToken) return;
    
    setIsLoadingPresentation(true);
    try {
      const { data, error } = await supabase.rpc("get_presentation_with_token", {
        p_presentation_id: presentationId,
        p_token: shareToken,
      });
      
      if (error) throw error;
      const presentations = data as Presentation[];
      if (presentations && presentations.length > 0) {
        setSelectedPresentation(presentations[0]);
        setSelectedSlideIndex(0);
        setActiveTab("editor");
      }
    } catch (err: any) {
      console.error("Error loading presentation:", err);
      toast.error("Failed to load presentation");
    } finally {
      setIsLoadingPresentation(false);
    }
  };

  // Create and generate presentation
  const handleCreatePresentation = async () => {
    if (!projectId || !shareToken) return;
    
    try {
      const { data: presentation, error } = await supabase.rpc("insert_presentation_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
        p_name: newName,
        p_initial_prompt: newPrompt || null,
        p_mode: newMode,
        p_target_slides: newTargetSlides,
        p_metadata: { imageModel: newImageModel, imageStyle: newImageStyle },
      });
      
      if (error) throw error;
      
      const newPresentation = presentation as Presentation;
      setIsCreateOpen(false);
      setSelectedPresentation(newPresentation);
      setActiveTab("editor");
      
      // Update list with new entry
      setPresentationsList(prev => [{
        id: newPresentation.id,
        project_id: newPresentation.project_id,
        name: newPresentation.name,
        initial_prompt: newPresentation.initial_prompt,
        mode: newPresentation.mode,
        target_slides: newPresentation.target_slides,
        status: newPresentation.status,
        slide_count: 0,
        cover_image_url: newPresentation.cover_image_url,
        metadata: newPresentation.metadata,
        created_at: newPresentation.created_at,
        updated_at: newPresentation.updated_at,
        created_by: newPresentation.created_by,
        version: newPresentation.version,
      }, ...prev]);
      
      // Start generation
      await generatePresentation(newPresentation);
      
    } catch (err: any) {
      console.error("Error creating presentation:", err);
      toast.error("Failed to create presentation");
    }
  };

  // Generate presentation via edge function with SSE
  const generatePresentation = async (presentation: Presentation) => {
    if (!projectId || !shareToken) return;
    
    setIsGenerating(true);
    setLiveBlackboard([]);
    setGenerationStatus("Starting...");
    
    try {
      const response = await fetch(
        `https://obkzdksfayygnrzdqoam.supabase.co/functions/v1/presentation-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
          },
          body: JSON.stringify({
            projectId,
            presentationId: presentation.id,
            shareToken,
            mode: presentation.mode,
            targetSlides: presentation.target_slides,
            initialPrompt: presentation.initial_prompt,
            imageModel: (presentation.metadata as any)?.imageModel || newImageModel,
            imageStyle: (presentation.metadata as any)?.imageStyle || newImageStyle,
          }),
        }
      );

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response stream");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const event = line.slice(7);
            const dataLine = lines[lines.indexOf(line) + 1];
            if (dataLine?.startsWith("data: ")) {
              try {
                const data = JSON.parse(dataLine.slice(6));
                
                if (event === "status") {
                  setGenerationStatus(data.message);
                } else if (event === "blackboard") {
                  setLiveBlackboard(prev => [...prev, data]);
                } else if (event === "complete") {
                  toast.success(`Generated ${data.slideCount} slides`);
                } else if (event === "error") {
                  toast.error(data.message);
                }
              } catch (e) {
                // Parse error, skip
              }
            }
          }
        }
      }

      // Reload the full presentation
      await loadFullPresentation(presentation.id);
      
      // Update list counts
      const { data: updatedList } = await supabase.rpc("get_project_presentations_list_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
      });
      if (updatedList) {
        setPresentationsList(updatedList as PresentationMeta[]);
      }
      
    } catch (err: any) {
      console.error("Generation error:", err);
      toast.error("Failed to generate presentation");
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
    }
  };

  // Delete presentation
  const handleDelete = async (id: string) => {
    if (!shareToken) return;
    
    try {
      await supabase.rpc("delete_presentation_with_token", {
        p_presentation_id: id,
        p_token: shareToken,
      });
      
      setPresentationsList(prev => prev.filter(p => p.id !== id));
      if (selectedPresentation?.id === id) {
        setSelectedPresentation(null);
        setWorkingSlides(null);
        setActiveTab("list");
      }
      toast.success("Presentation deleted");
    } catch (err: any) {
      toast.error("Failed to delete");
    }
  };

  // Export as JSON
  const handleExportJSON = () => {
    if (!selectedPresentation) return;
    const exportData = { ...selectedPresentation, slides: workingSlides };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedPresentation.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export as PDF
  const handleExportPDF = () => {
    if (!selectedPresentation || !workingSlides) return;
    if (workingSlides.length === 0) {
      toast.error("No slides to export");
      return;
    }

    setIsExportingPdf(true);
    pdfExportRef.current?.startExport();
  };

  const handlePdfExportComplete = () => {
    setIsExportingPdf(false);
    toast.success("PDF exported successfully");
  };

  const handlePdfExportError = (error: Error) => {
    console.error("PDF export error:", error);
    toast.error("Failed to export PDF");
    setIsExportingPdf(false);
  };

  // Update slide data - LOCAL only, no DB save
  const handleUpdateSlide = (slideIndex: number, updates: Partial<any>) => {
    if (!workingSlides) return;
    
    const updatedSlides = workingSlides.map((s, i) => i === slideIndex ? { ...s, ...updates } : s);
    setWorkingSlides(updatedSlides);
    setHasUnsavedChanges(true);
  };

  // Save all changes to database
  const handleSaveChanges = async () => {
    if (!selectedPresentation || !shareToken || !workingSlides) return;
    
    setIsSaving(true);
    try {
      await supabase.rpc("update_presentation_with_token", {
        p_presentation_id: selectedPresentation.id,
        p_token: shareToken,
        p_slides: workingSlides,
      });
      setHasUnsavedChanges(false);
      toast.success("Changes saved");
    } catch (err) {
      console.error("Failed to save:", err);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle font scale change
  const handleFontScaleChange = (fontScale: number) => {
    handleUpdateSlide(selectedSlideIndex, { fontScale });
  };

  // Handle layout change
  const handleLayoutChange = (layoutId: string) => {
    handleUpdateSlide(selectedSlideIndex, { layoutId });
  };

  // Get project context for image generation from blackboard
  const getProjectContext = () => {
    if (!selectedPresentation) return "";
    const blackboard = getBlackboard(selectedPresentation);
    const insights = blackboard.filter(e => e.category === "insight" || e.category === "analysis");
    if (insights.length > 0) {
      return insights.slice(0, 3).map(e => e.content).join(". ");
    }
    return selectedPresentation.name;
  };

  // Helper to safely get slides array
  const getSlides = (p: Presentation): any[] => {
    if (Array.isArray(p.slides)) return p.slides;
    return [];
  };

  // Helper to safely get blackboard array
  const getBlackboard = (p: Presentation): BlackboardEntry[] => {
    if (Array.isArray(p.blackboard)) return p.blackboard as unknown as BlackboardEntry[];
    return [];
  };

  // Get current slide from working copy
  const slides = workingSlides || [];
  const currentSlide = slides[selectedSlideIndex] || null;

  if (tokenMissing) {
    return (
      <div className="flex h-screen bg-background">
        <ProjectSidebar projectId={projectId || ""} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 md:p-6">
            <ProjectPageHeader title="Present" onMenuClick={() => setIsSidebarOpen(true)} />
            <TokenRecoveryMessage />
          </div>
        </div>
      </div>
    );
  }

  // Fullscreen mode
  if (isFullscreen && selectedPresentation && currentSlide) {
    return (
      <div 
        className="fixed inset-0 z-50 bg-background flex flex-col"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Escape") setIsFullscreen(false);
          if (e.key === "ArrowLeft" && selectedSlideIndex > 0) setSelectedSlideIndex(prev => prev - 1);
          if (e.key === "ArrowRight" && selectedSlideIndex < slides.length - 1) setSelectedSlideIndex(prev => prev + 1);
        }}
      >
        {/* Top controls bar */}
        <div className="shrink-0 flex items-center justify-between p-3 border-b bg-background">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedSlideIndex(prev => Math.max(0, prev - 1))}
              disabled={selectedSlideIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-16 text-center">
              {selectedSlideIndex + 1} / {slides.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
              disabled={selectedSlideIndex === slides.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant={showNotes ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowNotes(!showNotes)}
            >
              <StickyNote className="h-4 w-4 mr-1" />
              Notes
            </Button>
            <Button
              variant={showEditControls ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowEditControls(!showEditControls)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen(false)}>
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Edit controls bar - toggleable */}
        {showEditControls && (
          <div className="shrink-0 flex items-center gap-4 p-3 border-b bg-muted/30">
            <LayoutSelector 
              value={currentSlide.layoutId} 
              onChange={handleLayoutChange} 
            />
            <FontScaleControl 
              value={currentSlide.fontScale || 1} 
              onChange={handleFontScaleChange} 
            />
          </div>
        )}
        
        {/* Main content area */}
        <div className="flex-1 min-h-0 flex">
          {/* Slide - 16:9 container */}
          <div className={`flex-1 min-h-0 flex items-center justify-center p-4 ${showNotes ? '' : ''}`}>
            <div className="w-full h-full max-w-[calc((100vh-120px)*16/9)] aspect-video">
              <SlideRenderer
                slide={currentSlide}
                layouts={layouts}
                theme={currentTheme}
                isPreview={false}
                isFullscreen={true}
                fontScale={currentSlide.fontScale || 1}
                className="w-full h-full"
              />
            </div>
          </div>
          
          {/* Notes panel */}
          {showNotes && (
            <div className="w-80 border-l bg-background p-4 flex flex-col overflow-hidden">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 shrink-0">
                <StickyNote className="h-4 w-4" />
                Speaker Notes
              </h3>
              <Textarea
                value={currentSlide.notes || ""}
                onChange={(e) => handleUpdateSlide(selectedSlideIndex, { notes: e.target.value })}
                placeholder="Add speaker notes for this slide..."
                className="flex-1 resize-none"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <ProjectSidebar projectId={projectId || ""} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 md:p-6 flex-1 flex flex-col overflow-hidden">
          <ProjectPageHeader title="Present" onMenuClick={() => setIsSidebarOpen(true)} />
          
          <div className="mt-4 flex-1 flex flex-col overflow-hidden">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "list" | "editor" | "blackboard")} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <TabsList>
                  <TabsTrigger value="list">Presentations</TabsTrigger>
                  <TabsTrigger value="editor" disabled={!selectedPresentation}>
                    {selectedPresentation ? selectedPresentation.name : "Editor"}
                  </TabsTrigger>
                  <TabsTrigger value="blackboard" disabled={!selectedPresentation}>
                    Blackboard
                  </TabsTrigger>
                </TabsList>
                
                {activeTab === "list" && (
                  <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        New Presentation
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Presentation</DialogTitle>
                        <DialogDescription>
                          Configure and generate an AI-powered project presentation
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input value={newName} onChange={e => setNewName(e.target.value)} />
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Mode</Label>
                          <Select value={newMode} onValueChange={(v: "concise" | "detailed") => setNewMode(v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="concise">Concise (10-15 slides)</SelectItem>
                              <SelectItem value="detailed">Detailed (20-30 slides)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Target Slides</Label>
                          <Input 
                            type="number" 
                            value={newTargetSlides} 
                            onChange={e => setNewTargetSlides(parseInt(e.target.value) || 15)} 
                            min={5} 
                            max={50}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Custom Focus (optional)</Label>
                          <Textarea 
                            value={newPrompt} 
                            onChange={e => setNewPrompt(e.target.value)}
                            placeholder="Any specific areas you want to emphasize..."
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Palette className="h-4 w-4" />
                            Image Style
                          </Label>
                          <Select value={newImageStyle} onValueChange={setNewImageStyle}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {IMAGE_STYLES.map(style => (
                                <SelectItem key={style.id} value={style.id}>
                                  {style.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Bot className="h-4 w-4" />
                            Image Generation Model
                          </Label>
                          <Select value={newImageModel} onValueChange={setNewImageModel}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {IMAGE_MODELS.map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreatePresentation}>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              
              {/* Presentations List Tab */}
              <TabsContent value="list" className="flex-1 overflow-hidden mt-0">
                {isLoadingList ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : presentationsList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Presentations Yet</h3>
                    <p className="text-muted-foreground mb-4">Create your first AI-powered presentation</p>
                    <Button onClick={() => setIsCreateOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Presentation
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                      {presentationsList.map(p => (
                        <Card 
                          key={p.id} 
                          className="cursor-pointer hover:border-primary/50 transition-colors"
                          onClick={() => loadFullPresentation(p.id)}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base truncate">{p.name}</CardTitle>
                              <Badge variant={p.status === "completed" ? "default" : "secondary"}>
                                {p.status}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <p>{p.mode} • {p.slide_count} slides</p>
                              <p className="text-xs">{new Date(p.created_at).toLocaleDateString()}</p>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="flex-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadFullPresentation(p.id);
                                }}
                                disabled={isLoadingPresentation}
                              >
                                {isLoadingPresentation ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open"}
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(p.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
              
              {/* Editor Tab */}
              <TabsContent value="editor" className="flex-1 overflow-hidden mt-0">
                {isGenerating ? (
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="font-medium">{generationStatus}</span>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium mb-2">Blackboard (Live)</h4>
                        <ScrollArea className="h-[400px] border rounded-lg p-3 bg-muted/30">
                          {liveBlackboard.map((entry, i) => (
                            <div key={entry.id || i} className="mb-3 p-2 bg-background rounded border">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">{entry.source}</Badge>
                                <Badge variant="secondary" className="text-xs">{entry.category}</Badge>
                              </div>
                              <p className="text-sm">{entry.content}</p>
                            </div>
                          ))}
                        </ScrollArea>
                      </div>
                      <div className="flex items-center justify-center bg-muted/20 rounded-lg border-2 border-dashed">
                        <div className="text-center p-8">
                          <Sparkles className="h-12 w-12 text-primary/50 mx-auto mb-3 animate-pulse" />
                          <p className="text-muted-foreground">Generating slides...</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : selectedPresentation && slides.length > 0 ? (
                  <div className="flex flex-col h-full overflow-hidden">
                    {/* Header */}
                    <div className="shrink-0 flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">{selectedPresentation.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {slides.length} slides • {selectedPresentation.mode}
                          {hasUnsavedChanges && <span className="text-amber-500 ml-2">• Unsaved changes</span>}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant={hasUnsavedChanges ? "default" : "outline"} 
                          size="sm" 
                          onClick={handleSaveChanges}
                          disabled={!hasUnsavedChanges || isSaving}
                        >
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                          Save
                        </Button>
                        <Select value={currentTheme} onValueChange={(v: "default" | "light" | "vibrant") => setCurrentTheme(v)}>
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Dark Theme</SelectItem>
                            <SelectItem value="light">Light Theme</SelectItem>
                            <SelectItem value="vibrant">Vibrant Theme</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => setIsFullscreen(true)}>
                          <Maximize2 className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportJSON} title="Export JSON">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isExportingPdf} title="Export PDF">
                          {isExportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => generatePresentation(selectedPresentation)} title="Regenerate">
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowNotesPanel(!showNotesPanel)}
                          title={showNotesPanel ? "Hide notes" : "Show notes"}
                        >
                          {showNotesPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Main editor area */}
                    <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
                      {/* Thumbnails column */}
                      <div className="w-48 shrink-0 border rounded-lg bg-muted/20 overflow-hidden">
                        <SlideThumbnails
                          slides={slides}
                          layouts={layouts}
                          selectedSlideIndex={selectedSlideIndex}
                          onSlideChange={setSelectedSlideIndex}
                          theme={currentTheme}
                        />
                      </div>
                      
                      {/* Slide preview column */}
                      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                        {/* Slide controls */}
                        {currentSlide && (
                          <div className="shrink-0 flex items-center gap-4 mb-3 p-2 bg-muted/30 rounded-lg">
                            <LayoutSelector 
                              value={currentSlide.layoutId} 
                              onChange={handleLayoutChange} 
                            />
                            <FontScaleControl 
                              value={currentSlide.fontScale || 1} 
                              onChange={handleFontScaleChange} 
                            />
                            <div className="flex-1" />
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedSlideIndex(prev => Math.max(0, prev - 1))}
                                disabled={selectedSlideIndex === 0}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <span className="text-sm min-w-12 text-center">
                                {selectedSlideIndex + 1}/{slides.length}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
                                disabled={selectedSlideIndex === slides.length - 1}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {/* Slide renderer - 16:9 aspect ratio container */}
                        <div className="flex-1 min-h-0 flex items-center justify-center border rounded-lg overflow-hidden bg-muted/10 p-4">
                          {currentSlide && (
                            <div className="w-full h-full max-h-full" style={{ maxWidth: 'calc((100%) * 16 / 9)', aspectRatio: '16/9' }}>
                              <SlideRenderer
                                slide={currentSlide}
                                layouts={layouts}
                                theme={currentTheme}
                                isPreview={false}
                                isFullscreen={false}
                                fontScale={currentSlide.fontScale || 1}
                                className="w-full h-full"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Notes panel - toggleable */}
                      {showNotesPanel && currentSlide && (
                        <div className="w-72 shrink-0 flex flex-col overflow-hidden border rounded-lg bg-muted/20 p-3">
                          <h4 className="text-sm font-medium mb-2 flex items-center gap-2 shrink-0">
                            <StickyNote className="h-4 w-4" />
                            Speaker Notes
                          </h4>
                          <Textarea
                            value={currentSlide.notes || ""}
                            onChange={(e) => handleUpdateSlide(selectedSlideIndex, { notes: e.target.value })}
                            placeholder="Add speaker notes..."
                            className="flex-1 resize-none text-sm"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Presentation Selected</h3>
                    <p className="text-muted-foreground mb-4">
                      Select a presentation from the list or create a new one
                    </p>
                    <Button onClick={() => setActiveTab("list")}>
                      View Presentations
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Blackboard Tab */}
              <TabsContent value="blackboard" className="flex-1 overflow-hidden mt-0">
                {selectedPresentation ? (
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
                      {getBlackboard(selectedPresentation).map((entry, i) => (
                        <Card key={entry.id || i} className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-xs">{entry.source}</Badge>
                            <Badge variant="secondary" className="text-xs">{entry.category}</Badge>
                          </div>
                          <p className="text-sm">{entry.content}</p>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <p className="text-muted-foreground">Select a presentation to view its blackboard</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* PDF Export Renderer - offscreen */}
      {selectedPresentation && isExportingPdf && workingSlides && (
        <PdfExportRenderer
          ref={pdfExportRef}
          slides={workingSlides}
          layouts={layouts}
          presentationName={selectedPresentation.name}
          theme={currentTheme}
          onComplete={handlePdfExportComplete}
          onError={handlePdfExportError}
        />
      )}
    </div>
  );
}
