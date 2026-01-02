import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { AccessLevelBanner } from "@/components/project/AccessLevelBanner";
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
import { Plus, RefreshCw, Trash2, Download, Loader2, Sparkles, Maximize2, Minimize2, FileDown, Bot } from "lucide-react";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import { SlidePreview } from "@/components/present/SlidePreview";
import { SlideThumbnails } from "@/components/present/SlideThumbnails";
import { SlideNotesEditor } from "@/components/present/SlideNotesEditor";
import { FontScaleControl } from "@/components/present/FontScaleControl";
import { LayoutSelector } from "@/components/present/LayoutSelector";
import { SlideRenderer } from "@/components/present/SlideRenderer";
import { exportPresentationToPdf } from "@/lib/presentationPdfExport";
// Layouts loaded from static JSON
const presentationLayoutsData = {
  layouts: [
    { id: "title-cover", name: "Title Cover", description: "Full-bleed cover", category: "title", regions: [
      { id: "background", type: "image", x: 0, y: 0, width: 100, height: 100 },
      { id: "title", type: "heading", x: 10, y: 35, width: 80, height: 20, align: "center", level: 1 },
      { id: "subtitle", type: "text", x: 10, y: 55, width: 80, height: 10, align: "center" }
    ]},
    { id: "section-divider", name: "Section Divider", description: "Bold section break", category: "divider", regions: [
      { id: "section-number", type: "heading", x: 10, y: 30, width: 80, height: 15, align: "center", level: 1 },
      { id: "title", type: "heading", x: 10, y: 50, width: 80, height: 15, align: "center", level: 2 }
    ]},
    { id: "title-content", name: "Title + Content", description: "Header with content", category: "content", regions: [
      { id: "title", type: "heading", x: 5, y: 5, width: 90, height: 12, level: 2 },
      { id: "content", type: "richtext", x: 5, y: 22, width: 90, height: 73 }
    ]},
    { id: "two-column", name: "Two Columns", description: "Side-by-side content", category: "content", regions: [
      { id: "title", type: "heading", x: 5, y: 5, width: 90, height: 12, level: 2 },
      { id: "left-content", type: "richtext", x: 5, y: 20, width: 43, height: 75 },
      { id: "right-content", type: "richtext", x: 52, y: 20, width: 43, height: 75 }
    ]},
    { id: "image-left", name: "Image Left", description: "Image on left with content", category: "media", regions: [
      { id: "title", type: "heading", x: 52, y: 5, width: 43, height: 12, level: 2 },
      { id: "image", type: "image", x: 0, y: 0, width: 48, height: 100 },
      { id: "content", type: "richtext", x: 52, y: 20, width: 43, height: 75 }
    ]},
    { id: "image-right", name: "Image Right", description: "Content with image on right", category: "media", regions: [
      { id: "title", type: "heading", x: 5, y: 5, width: 43, height: 12, level: 2 },
      { id: "content", type: "richtext", x: 5, y: 20, width: 43, height: 75 },
      { id: "image", type: "image", x: 52, y: 0, width: 48, height: 100 }
    ]},
    { id: "stats-grid", name: "Statistics Grid", description: "4-cell metrics grid", category: "data", regions: [
      { id: "title", type: "heading", x: 5, y: 5, width: 90, height: 12, level: 2 },
      { id: "stat-1", type: "stat", x: 5, y: 22, width: 43, height: 35 },
      { id: "stat-2", type: "stat", x: 52, y: 22, width: 43, height: 35 },
      { id: "stat-3", type: "stat", x: 5, y: 60, width: 43, height: 35 },
      { id: "stat-4", type: "stat", x: 52, y: 60, width: 43, height: 35 }
    ]},
    { id: "bullets", name: "Bullet Points", description: "Clean bullet list", category: "content", regions: [
      { id: "title", type: "heading", x: 5, y: 5, width: 90, height: 12, level: 2 },
      { id: "bullets", type: "bullets", x: 5, y: 20, width: 90, height: 75 }
    ]},
    { id: "quote", name: "Quote", description: "Prominent quote", category: "accent", regions: [
      { id: "quote", type: "text", x: 15, y: 35, width: 70, height: 30, size: "2xl" },
      { id: "attribution", type: "text", x: 15, y: 70, width: 70, height: 8, align: "right" }
    ]},
    { id: "architecture", name: "Architecture", description: "Visual diagram", category: "technical", regions: [
      { id: "title", type: "heading", x: 5, y: 3, width: 90, height: 8, level: 2 },
      { id: "diagram", type: "image", x: 5, y: 13, width: 90, height: 82 }
    ]},
    { id: "timeline", name: "Timeline", description: "Horizontal timeline", category: "content", regions: [
      { id: "title", type: "heading", x: 5, y: 5, width: 90, height: 10, level: 2 },
      { id: "timeline", type: "timeline", x: 5, y: 20, width: 90, height: 75 }
    ]},
    { id: "icon-grid", name: "Icon Grid", description: "Grid of icons with labels", category: "content", regions: [
      { id: "title", type: "heading", x: 5, y: 5, width: 90, height: 10, level: 2 },
      { id: "grid", type: "icon-grid", x: 5, y: 25, width: 90, height: 70 }
    ]},
    { id: "table", name: "Data Table", description: "Tabular data", category: "data", regions: [
      { id: "title", type: "heading", x: 5, y: 5, width: 90, height: 10, level: 2 },
      { id: "table", type: "table", x: 5, y: 18, width: 90, height: 77 }
    ]},
    { id: "comparison", name: "Comparison", description: "Side-by-side comparison", category: "content", regions: [
      { id: "title", type: "heading", x: 5, y: 5, width: 90, height: 10, level: 2 },
      { id: "left-header", type: "heading", x: 5, y: 18, width: 43, height: 8, level: 3 },
      { id: "right-header", type: "heading", x: 52, y: 18, width: 43, height: 8, level: 3 },
      { id: "left-content", type: "bullets", x: 5, y: 28, width: 43, height: 67 },
      { id: "right-content", type: "bullets", x: 52, y: 28, width: 43, height: 67 }
    ]},
    { id: "chart-full", name: "Full Chart", description: "Large chart visualization", category: "data", regions: [
      { id: "title", type: "heading", x: 5, y: 5, width: 70, height: 10, level: 2 },
      { id: "chart", type: "chart", x: 5, y: 22, width: 90, height: 73 }
    ]}
  ]
};

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
  
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [selectedPresentation, setSelectedPresentation] = useState<Presentation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [liveBlackboard, setLiveBlackboard] = useState<BlackboardEntry[]>([]);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<"default" | "light" | "vibrant">("default");
  
  // Layouts from JSON
  const layouts: Layout[] = presentationLayoutsData.layouts;
  
  // Create dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("New Presentation");
  const [newMode, setNewMode] = useState<"concise" | "detailed">("concise");
  const [newTargetSlides, setNewTargetSlides] = useState(15);
  const [newPrompt, setNewPrompt] = useState("");
  const [newImageModel, setNewImageModel] = useState("gemini-2.5-flash-image");
  
  // PDF export state
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const slideRenderRef = useRef<HTMLDivElement>(null);
  
  // Image models for selection
  const IMAGE_MODELS = [
    { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (Recommended)' },
    { id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview' },
  ];

  // Load presentations
  useEffect(() => {
    const loadPresentations = async () => {
      if (!projectId || !isTokenSet) return;
      setIsLoading(true);
      
      try {
        const { data, error } = await supabase.rpc("get_project_presentations_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
        });
        
        if (error) throw error;
        setPresentations((data || []) as Presentation[]);
      } catch (err: any) {
        console.error("Error loading presentations:", err);
        toast.error("Failed to load presentations");
      } finally {
        setIsLoading(false);
      }
    };
    
    loadPresentations();
  }, [projectId, shareToken, isTokenSet]);

  // Create and generate presentation
  const handleCreatePresentation = async () => {
    if (!projectId || !shareToken) return;
    
    try {
      // Create the presentation record with imageModel in metadata
      const { data: presentation, error } = await supabase.rpc("insert_presentation_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
        p_name: newName,
        p_initial_prompt: newPrompt || null,
        p_mode: newMode,
        p_target_slides: newTargetSlides,
        p_metadata: { imageModel: newImageModel },
      });
      
      if (error) throw error;
      
      const newPresentation = presentation as Presentation;
      setIsCreateOpen(false);
      setPresentations(prev => [newPresentation, ...prev]);
      setSelectedPresentation(newPresentation);
      
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
                } else if (event === "slide") {
                  // Handle slide generation
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

      // Reload presentation
      const { data: updated } = await supabase.rpc("get_project_presentations_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
      });
      
      if (updated) {
        const updatedPresentations = updated as Presentation[];
        setPresentations(updatedPresentations);
        const current = updatedPresentations.find(p => p.id === presentation.id);
        if (current) setSelectedPresentation(current);
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
      
      setPresentations(prev => prev.filter(p => p.id !== id));
      if (selectedPresentation?.id === id) setSelectedPresentation(null);
      toast.success("Presentation deleted");
    } catch (err: any) {
      toast.error("Failed to delete");
    }
  };

  // Export as JSON
  const handleExportJSON = () => {
    if (!selectedPresentation) return;
    const blob = new Blob([JSON.stringify(selectedPresentation, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedPresentation.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export as PDF
  const handleExportPDF = async () => {
    if (!selectedPresentation) return;
    const slides = getSlides(selectedPresentation);
    if (slides.length === 0) {
      toast.error("No slides to export");
      return;
    }

    setIsExportingPdf(true);
    toast.info("Generating PDF...", { duration: 10000 });

    try {
      await exportPresentationToPdf(
        selectedPresentation.name,
        slides,
        (slideIndex) => {
          // Create a temporary container for rendering
          const container = document.getElementById(`pdf-slide-render-${slideIndex}`);
          return container;
        },
        (current, total) => {
          toast.info(`Capturing slide ${current}/${total}...`, { id: "pdf-progress" });
        }
      );
      toast.success("PDF exported successfully!", { id: "pdf-progress" });
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error("Failed to export PDF");
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Update slide data
  const handleUpdateSlide = async (slideIndex: number, updates: Partial<any>) => {
    if (!selectedPresentation || !shareToken) return;
    
    const slides = getSlides(selectedPresentation);
    const updatedSlides = slides.map((s, i) => i === slideIndex ? { ...s, ...updates } : s);
    
    try {
      await supabase.rpc("update_presentation_with_token", {
        p_presentation_id: selectedPresentation.id,
        p_token: shareToken,
        p_slides: updatedSlides,
      });
      
      // Update local state
      const updatedPresentation = { ...selectedPresentation, slides: updatedSlides as unknown as Json };
      setSelectedPresentation(updatedPresentation);
      setPresentations(prev => prev.map(p => p.id === selectedPresentation.id ? updatedPresentation : p));
    } catch (err) {
      console.error("Failed to update slide:", err);
      toast.error("Failed to save changes");
    }
  };

  // Handle notes save
  const handleSaveNotes = async (notes: string) => {
    await handleUpdateSlide(selectedSlideIndex, { notes });
    toast.success("Notes saved");
  };

  // Handle font scale change
  const handleFontScaleChange = async (fontScale: number) => {
    await handleUpdateSlide(selectedSlideIndex, { fontScale });
  };

  // Handle layout change
  const handleLayoutChange = async (layoutId: string) => {
    await handleUpdateSlide(selectedSlideIndex, { layoutId });
    toast.success("Layout updated");
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

  // Get current slide
  const currentSlide = selectedPresentation ? getSlides(selectedPresentation)[selectedSlideIndex] : null;

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

  // Fullscreen rendering - bypasses all page layout
  if (isFullscreen && selectedPresentation) {
    const slides = getSlides(selectedPresentation);
    const currentSlide = slides[selectedSlideIndex];
    
    if (currentSlide) {
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
          {/* Controls bar */}
          <div className="shrink-0 flex items-center justify-between p-3 border-b bg-background/95">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSlideIndex(prev => Math.max(0, prev - 1))}
                disabled={selectedSlideIndex === 0}
              >
                <span className="sr-only">Previous</span>
                ←
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
                <span className="sr-only">Next</span>
                →
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen(false)}>
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Slide fills remaining space */}
          <div className="flex-1 min-h-0">
            <SlidePreview
              slides={slides}
              layouts={layouts}
              selectedSlideIndex={selectedSlideIndex}
              onSlideChange={setSelectedSlideIndex}
              theme={currentTheme}
              externalFullscreen={true}
            />
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex h-screen bg-background">
      <ProjectSidebar projectId={projectId || ""} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 md:p-6 flex-1 overflow-auto">
          <ProjectPageHeader title="Present" onMenuClick={() => setIsSidebarOpen(true)} />
          <AccessLevelBanner projectId={projectId || ""} shareToken={shareToken} />
          
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold font-raleway">Presentations</h2>
                <p className="text-muted-foreground">Generate AI-powered project presentations</p>
              </div>
              
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
            </div>

            {/* Main Content Layout */}
            {isFullscreen && selectedPresentation ? (
              // Fullscreen slide viewer
              <div className="fixed inset-0 z-50 bg-background">
                <div className="absolute top-4 right-4 z-10">
                  <Button variant="outline" size="sm" onClick={() => setIsFullscreen(false)}>
                    <Minimize2 className="h-4 w-4 mr-1" />
                    Exit Fullscreen
                  </Button>
                </div>
                <SlidePreview
                  slides={getSlides(selectedPresentation)}
                  layouts={layouts}
                  selectedSlideIndex={selectedSlideIndex}
                  onSlideChange={setSelectedSlideIndex}
                  theme={currentTheme}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Presentations List */}
                <Card className="lg:col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Presentations</CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    <ScrollArea className="h-[calc(100vh-320px)]">
                      {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : presentations.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8 text-sm">No presentations yet</p>
                      ) : (
                        <div className="space-y-2">
                          {presentations.map(p => (
                            <div 
                              key={p.id}
                              className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedPresentation?.id === p.id ? "bg-muted border-primary" : "hover:bg-muted/50"}`}
                              onClick={() => {
                                setSelectedPresentation(p);
                                setSelectedSlideIndex(0);
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium truncate text-sm">{p.name}</span>
                                <Badge variant={p.status === "completed" ? "default" : "secondary"} className="text-xs">
                                  {p.status}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {p.mode} • {getSlides(p).length} slides
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Main Viewer */}
                <Card className="lg:col-span-3">
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
                  ) : selectedPresentation ? (
                    <div className="p-4">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold font-raleway">{selectedPresentation.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {getSlides(selectedPresentation).length} slides • {selectedPresentation.mode}
                          </p>
                        </div>
                        <div className="flex gap-2">
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
                          <Button variant="outline" size="sm" onClick={() => generatePresentation(selectedPresentation)} title="Regenerate Presentation">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(selectedPresentation.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <Tabs defaultValue="slides">
                        <TabsList className="mb-3">
                          <TabsTrigger value="slides">Slides</TabsTrigger>
                          <TabsTrigger value="blackboard">Blackboard ({getBlackboard(selectedPresentation).length})</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="slides" className="mt-0">
                          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                            {/* Thumbnails */}
                            <div className="lg:col-span-1 border rounded-lg bg-muted/20">
                              <SlideThumbnails
                                slides={getSlides(selectedPresentation)}
                                layouts={layouts}
                                selectedSlideIndex={selectedSlideIndex}
                                onSlideChange={setSelectedSlideIndex}
                                theme={currentTheme}
                              />
                            </div>
                            
                            {/* Main Preview */}
                            <div className="lg:col-span-3">
                              {/* Slide controls */}
                              {currentSlide && (
                                <div className="flex items-center gap-4 mb-3 p-2 bg-muted/30 rounded-lg">
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
                              <SlidePreview
                                slides={getSlides(selectedPresentation)}
                                layouts={layouts}
                                selectedSlideIndex={selectedSlideIndex}
                                onSlideChange={setSelectedSlideIndex}
                                theme={currentTheme}
                                fontScale={currentSlide?.fontScale}
                              />
                              {/* Notes editor */}
                              {currentSlide && (
                                <SlideNotesEditor
                                  notes={currentSlide.notes || ""}
                                  onSave={handleSaveNotes}
                                />
                              )}
                            </div>
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="blackboard" className="mt-0">
                          <ScrollArea className="h-[calc(100vh-400px)]">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {getBlackboard(selectedPresentation).map((entry, i) => (
                                <div key={entry.id || i} className="p-3 bg-muted rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="outline" className="text-xs">{entry.source}</Badge>
                                    <Badge 
                                      variant={entry.category === "insight" ? "default" : entry.category === "analysis" ? "secondary" : "outline"} 
                                      className="text-xs"
                                    >
                                      {entry.category}
                                    </Badge>
                                  </div>
                                  <p className="text-sm">{entry.content}</p>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </TabsContent>
                      </Tabs>
                    </div>
                  ) : (
                    <div className="p-6 flex flex-col items-center justify-center h-[500px] text-center">
                      <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2 font-raleway">No Presentation Selected</h3>
                      <p className="text-muted-foreground mb-4">
                        Select an existing presentation or create a new one
                      </p>
                      <Button onClick={() => setIsCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Presentation
                      </Button>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}