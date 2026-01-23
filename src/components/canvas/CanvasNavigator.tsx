import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ProjectCanvas } from "@/hooks/useProjectCanvases";

interface CanvasNavigatorProps {
  canvases: ProjectCanvas[];
  activeCanvas: ProjectCanvas | null;
  activeCanvasId: string | null;
  isLegacyMode: boolean;
  onSelectCanvas: (canvasId: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onCreateCanvas: (name: string, description?: string, tags?: string[]) => void;
  onUpdateCanvas: (canvas: Partial<ProjectCanvas> & { id: string }) => void;
  onDeleteCanvas: (canvasId: string) => void;
}

export function CanvasNavigator({
  canvases,
  activeCanvas,
  activeCanvasId,
  isLegacyMode,
  onSelectCanvas,
  onPrevious,
  onNext,
  onCreateCanvas,
  onUpdateCanvas,
  onDeleteCanvas,
}: CanvasNavigatorProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  
  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");

  // New canvas form state
  const [newName, setNewName] = useState("New Canvas");
  const [newDescription, setNewDescription] = useState("");
  const [newTags, setNewTags] = useState("");

  const displayName = isLegacyMode ? "Canvas 1" : (activeCanvas?.name || "Canvas 1");
  const displayDescription = activeCanvas?.description || "";
  const displayTags = activeCanvas?.tags || [];
  const currentIndex = canvases.findIndex(c => c.id === activeCanvasId);
  const totalCanvases = isLegacyMode ? 1 : canvases.length;

  const handleOpenEditDialog = () => {
    if (activeCanvas) {
      setEditName(activeCanvas.name);
      setEditDescription(activeCanvas.description || "");
      setEditTags(activeCanvas.tags?.join(", ") || "");
    } else {
      setEditName("Canvas 1");
      setEditDescription("");
      setEditTags("");
    }
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    const tags = editTags.split(",").map(t => t.trim()).filter(Boolean);
    
    if (activeCanvas) {
      onUpdateCanvas({
        id: activeCanvas.id,
        name: editName,
        description: editDescription || null,
        tags,
      });
    } else {
      // Legacy mode: create the first canvas
      onCreateCanvas(editName, editDescription, tags);
    }
    setIsEditDialogOpen(false);
  };

  const handleCreateNew = () => {
    const tags = newTags.split(",").map(t => t.trim()).filter(Boolean);
    onCreateCanvas(newName, newDescription, tags);
    setIsNewDialogOpen(false);
    setNewName("New Canvas");
    setNewDescription("");
    setNewTags("");
  };

  return (
    <div className="border-b border-border">
      {/* Canvas Navigation Row */}
      <div className="p-2 flex items-center gap-2">
        {/* Left Arrow */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={onPrevious}
          disabled={totalCanvases <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Canvas Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="flex-1 justify-between text-left font-medium h-8 min-w-0"
            >
              <span className="truncate">{displayName}</span>
              <span className="ml-2 text-xs text-muted-foreground flex-shrink-0">
                {currentIndex + 1}/{totalCanvases}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-56 bg-popover">
            {isLegacyMode ? (
              <DropdownMenuItem onClick={handleOpenEditDialog}>
                Canvas 1 (Edit to save)
              </DropdownMenuItem>
            ) : (
              canvases.map((canvas) => (
                <DropdownMenuItem
                  key={canvas.id}
                  onClick={() => onSelectCanvas(canvas.id)}
                  className={canvas.id === activeCanvasId ? "bg-accent" : ""}
                >
                  <span className="truncate">{canvas.name}</span>
                  {canvas.is_default && (
                    <Badge variant="secondary" className="ml-2 text-xs">Default</Badge>
                  )}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsNewDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Canvas
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Right Arrow */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={onNext}
          disabled={totalCanvases <= 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Settings Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={handleOpenEditDialog}
        >
          <Settings className="h-4 w-4" />
        </Button>

        {/* New Canvas Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={() => setIsNewDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Collapsible Details Section */}
      <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full h-6 rounded-none hover:bg-muted/50 text-xs text-muted-foreground"
          >
            {isDetailsOpen ? (
              <>Hide Details <ChevronUp className="h-3 w-3 ml-1" /></>
            ) : (
              <>Show Details <ChevronDown className="h-3 w-3 ml-1" /></>
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            {displayDescription ? (
              <p className="text-xs text-muted-foreground">{displayDescription}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">No description</p>
            )}
            {displayTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {displayTags.map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Edit Canvas Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isLegacyMode ? "Save Canvas" : "Edit Canvas"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="canvas-name">Name</Label>
              <Input
                id="canvas-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Canvas name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="canvas-description">Description</Label>
              <Textarea
                id="canvas-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="canvas-tags">Tags (comma-separated)</Label>
              <Input
                id="canvas-tags"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="e.g. architecture, frontend, mvp"
              />
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            {activeCanvas && !activeCanvas.is_default && canvases.length > 1 && (
              <Button
                variant="destructive"
                onClick={() => {
                  onDeleteCanvas(activeCanvas.id);
                  setIsEditDialogOpen(false);
                }}
              >
                Delete
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Canvas Dialog */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Canvas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-canvas-name">Name</Label>
              <Input
                id="new-canvas-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Canvas name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-canvas-description">Description</Label>
              <Textarea
                id="new-canvas-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-canvas-tags">Tags (comma-separated)</Label>
              <Input
                id="new-canvas-tags"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="e.g. architecture, frontend, mvp"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateNew}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
