import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Settings, ChevronDown, ChevronUp, Copy, Merge, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  onDuplicateCanvas?: (canvasId: string, newName: string) => void;
  onMergeCanvases?: (sourceCanvasId: string, targetCanvasId: string) => void;
  onSplitToNewCanvas?: (nodeIds: string[], newCanvasName: string) => void;
  selectedNodeIds?: string[];
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
  onDuplicateCanvas,
  onMergeCanvases,
  onSplitToNewCanvas,
  selectedNodeIds = [],
}: CanvasNavigatorProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isSplitDialogOpen, setIsSplitDialogOpen] = useState(false);
  
  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");

  // New canvas form state
  const [newName, setNewName] = useState("New Canvas");
  const [newDescription, setNewDescription] = useState("");
  const [newTags, setNewTags] = useState("");

  // Duplicate form state
  const [duplicateName, setDuplicateName] = useState("");
  
  // Merge form state
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  
  // Split form state
  const [splitCanvasName, setSplitCanvasName] = useState("Split Canvas");

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

  const handleOpenDuplicateDialog = () => {
    if (activeCanvas) {
      setDuplicateName(`${activeCanvas.name} (Copy)`);
    } else {
      setDuplicateName("Canvas 1 (Copy)");
    }
    setIsDuplicateDialogOpen(true);
  };

  const handleDuplicate = () => {
    if (activeCanvasId && onDuplicateCanvas) {
      onDuplicateCanvas(activeCanvasId, duplicateName);
    }
    setIsDuplicateDialogOpen(false);
    setDuplicateName("");
  };

  const handleOpenMergeDialog = () => {
    // Default to first canvas that isn't the current one
    const otherCanvas = canvases.find(c => c.id !== activeCanvasId);
    setMergeTargetId(otherCanvas?.id || "");
    setIsMergeDialogOpen(true);
  };

  const handleMerge = () => {
    if (activeCanvasId && mergeTargetId && onMergeCanvases) {
      onMergeCanvases(activeCanvasId, mergeTargetId);
    }
    setIsMergeDialogOpen(false);
    setMergeTargetId("");
  };

  const handleOpenSplitDialog = () => {
    setSplitCanvasName("Split Canvas");
    setIsSplitDialogOpen(true);
  };

  const handleSplit = () => {
    if (selectedNodeIds.length > 0 && onSplitToNewCanvas) {
      onSplitToNewCanvas(selectedNodeIds, splitCanvasName);
    }
    setIsSplitDialogOpen(false);
    setSplitCanvasName("Split Canvas");
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
          title="Previous Canvas"
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
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Right Arrow */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={onNext}
          disabled={totalCanvases <= 1}
          title="Next Canvas"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Settings Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={handleOpenEditDialog}
          title="Edit Canvas"
        >
          <Settings className="h-4 w-4" />
        </Button>

        {/* New Canvas Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={() => setIsNewDialogOpen(true)}
          title="New Canvas"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Canvas Actions Row - visible buttons for management */}
      <div className="px-2 pb-2 flex items-center gap-1 flex-wrap">
        {/* Duplicate Button */}
        {onDuplicateCanvas && activeCanvasId && !isLegacyMode && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleOpenDuplicateDialog}
            title="Duplicate this canvas with all nodes, edges, and layers"
          >
            <Copy className="h-3 w-3" />
            Duplicate
          </Button>
        )}
        
        {/* Merge Button */}
        {onMergeCanvases && canvases.length >= 2 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleOpenMergeDialog}
            title="Merge this canvas into another"
          >
            <Merge className="h-3 w-3" />
            Merge
          </Button>
        )}
        
        {/* Split Selection Button */}
        {onSplitToNewCanvas && selectedNodeIds.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleOpenSplitDialog}
            title={`Move ${selectedNodeIds.length} selected node(s) to a new canvas`}
          >
            <Scissors className="h-3 w-3" />
            Split ({selectedNodeIds.length})
          </Button>
        )}
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

      {/* Duplicate Canvas Dialog */}
      <Dialog open={isDuplicateDialogOpen} onOpenChange={setIsDuplicateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate Canvas</DialogTitle>
            <DialogDescription>
              Create a copy of the current canvas with all nodes, edges, and layers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-canvas-name">New Canvas Name</Label>
              <Input
                id="duplicate-canvas-name"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                placeholder="Canvas name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDuplicateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDuplicate} disabled={!duplicateName.trim()}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Canvas Dialog */}
      <Dialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Merge Canvas</DialogTitle>
            <DialogDescription>
              Move all nodes, edges, and layers from "{activeCanvas?.name || 'Current Canvas'}" into another canvas.
              The current canvas will be deleted after merging.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Merge Into</Label>
              <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target canvas" />
                </SelectTrigger>
                <SelectContent>
                  {canvases
                    .filter(c => c.id !== activeCanvasId)
                    .map((canvas) => (
                      <SelectItem key={canvas.id} value={canvas.id}>
                        {canvas.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMergeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMerge} disabled={!mergeTargetId}>
              <Merge className="h-4 w-4 mr-2" />
              Merge & Delete Current
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split to New Canvas Dialog */}
      <Dialog open={isSplitDialogOpen} onOpenChange={setIsSplitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Split to New Canvas</DialogTitle>
            <DialogDescription>
              Move {selectedNodeIds.length} selected node{selectedNodeIds.length !== 1 ? 's' : ''} and their connected edges to a new canvas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="split-canvas-name">New Canvas Name</Label>
              <Input
                id="split-canvas-name"
                value={splitCanvasName}
                onChange={(e) => setSplitCanvasName(e.target.value)}
                placeholder="Canvas name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSplitDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSplit} disabled={!splitCanvasName.trim() || selectedNodeIds.length === 0}>
              <Scissors className="h-4 w-4 mr-2" />
              Split to New Canvas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
