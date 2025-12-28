import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PlayCircle,
  Settings2,
  Package,
  FileText,
  MessageSquare,
  ListTree,
  BookOpen,
  Layers,
  Network,
  FileCode,
  Database,
  Info,
  Shuffle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ProjectSelector, ProjectSelectionResult } from "@/components/project/ProjectSelector";

// Audit processing settings
export type ConsolidationLevel = "low" | "medium" | "high";
export type ChunkSize = "small" | "medium" | "large";
export type BatchSize = "1" | "5" | "10" | "50" | "unlimited";
export type MappingMode = "one_to_one" | "one_to_many";

interface AuditConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartAudit: (config: AuditConfiguration) => void;
  isLoading?: boolean;
  projectId: string;
  shareToken: string | null;
}

export interface EnhancedSortActions {
  move: boolean;
  clone: boolean;
  create: boolean;
}

export type AuditMode = "comparison" | "single";

export interface AuditConfiguration {
  name: string;
  description: string;
  // Audit mode - single (D1 only) or comparison (D1 vs D2)
  auditMode: AuditMode;
  // Legacy fields for backward compatibility
  dataset1Type: string;
  dataset1Ids: string[];
  dataset2Type: string;
  dataset2Ids: string[];
  // New fields for mixed-category selection
  dataset1Content?: ProjectSelectionResult;
  dataset2Content?: ProjectSelectionResult;
  // Processing settings
  consolidationLevel: ConsolidationLevel;
  chunkSize: ChunkSize;
  batchSize: BatchSize;
  mappingMode: MappingMode;
  maxConceptsPerElement?: number; // Default 10 for 1:many mode
  // Enhanced sort settings
  enhancedSortEnabled?: boolean;
  enhancedSortActions?: EnhancedSortActions;
}


// Helper to count items in a ProjectSelectionResult
function countSelectionItems(selection: ProjectSelectionResult | null): number {
  if (!selection) return 0;
  return (
    (selection.projectMetadata ? 1 : 0) +
    selection.artifacts.length +
    selection.chatSessions.length +
    selection.requirements.length +
    selection.standards.length +
    selection.techStacks.length +
    selection.canvasNodes.length +
    selection.files.length +
    selection.databases.length
  );
}

// Helper to get category badges for a selection
function getSelectionBadges(selection: ProjectSelectionResult | null): Array<{ label: string; count: number; icon: React.ElementType }> {
  if (!selection) return [];
  const badges: Array<{ label: string; count: number; icon: React.ElementType }> = [];
  
  if (selection.projectMetadata) badges.push({ label: "Metadata", count: 1, icon: Info });
  if (selection.requirements.length > 0) badges.push({ label: "Requirements", count: selection.requirements.length, icon: ListTree });
  if (selection.artifacts.length > 0) badges.push({ label: "Artifacts", count: selection.artifacts.length, icon: FileText });
  if (selection.chatSessions.length > 0) badges.push({ label: "Chats", count: selection.chatSessions.length, icon: MessageSquare });
  if (selection.standards.length > 0) badges.push({ label: "Standards", count: selection.standards.length, icon: BookOpen });
  if (selection.techStacks.length > 0) badges.push({ label: "Tech Stacks", count: selection.techStacks.length, icon: Layers });
  if (selection.canvasNodes.length > 0) badges.push({ label: "Canvas", count: selection.canvasNodes.length, icon: Network });
  if (selection.files.length > 0) badges.push({ label: "Files", count: selection.files.length, icon: FileCode });
  if (selection.databases.length > 0) badges.push({ label: "Databases", count: selection.databases.length, icon: Database });
  
  return badges;
}

// Derive the primary dataset type from selection content
function getPrimaryDatasetType(selection: ProjectSelectionResult | null): string {
  if (!selection) return "mixed";
  
  // Find the category with the most items
  const counts = [
    { type: "requirements", count: selection.requirements.length },
    { type: "artifacts", count: selection.artifacts.length },
    { type: "standards", count: selection.standards.length },
    { type: "tech_stacks", count: selection.techStacks.length },
    { type: "canvas_nodes", count: selection.canvasNodes.length },
    { type: "repository", count: selection.files.length },
    { type: "databases", count: selection.databases.length },
    { type: "chats", count: selection.chatSessions.length },
  ];
  
  const sorted = counts.filter(c => c.count > 0).sort((a, b) => b.count - a.count);
  
  // If single category, return it; otherwise return "mixed"
  if (sorted.length === 1) return sorted[0].type;
  return "mixed";
}

export function AuditConfigurationDialog({
  open,
  onOpenChange,
  onStartAudit,
  isLoading = false,
  projectId,
  shareToken,
}: AuditConfigurationDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  
  // Processing settings
  const [consolidationLevel, setConsolidationLevel] = useState<ConsolidationLevel>("medium");
  const [chunkSize, setChunkSize] = useState<ChunkSize>("medium");
  const [batchSize, setBatchSize] = useState<BatchSize>("unlimited");
  const [mappingMode, setMappingMode] = useState<MappingMode>("one_to_one");
  const [maxConceptsPerElement, setMaxConceptsPerElement] = useState<number>(10);
  
  // Enhanced Sort settings
  const [enhancedSortEnabled, setEnhancedSortEnabled] = useState(false);
  const [enhancedSortActions, setEnhancedSortActions] = useState<EnhancedSortActions>({
    move: true,
    clone: true,
    create: true,
  });
  
  // ProjectSelector state
  const [dataset1Selection, setDataset1Selection] = useState<ProjectSelectionResult | null>(null);
  const [dataset2Selection, setDataset2Selection] = useState<ProjectSelectionResult | null>(null);
  const [showSelector1, setShowSelector1] = useState(false);
  const [showSelector2, setShowSelector2] = useState(false);

  const handleSubmit = () => {
    // Extract IDs from selections for legacy compatibility
    const d1Ids = dataset1Selection ? [
      ...dataset1Selection.requirements.map((r: any) => r.id),
      ...dataset1Selection.artifacts.map((a: any) => a.id),
      ...dataset1Selection.standards.map((s: any) => s.id),
      ...dataset1Selection.techStacks.map((t: any) => t.id),
      ...dataset1Selection.canvasNodes.map((n: any) => n.id),
      ...dataset1Selection.chatSessions.map((c: any) => c.id),
    ].filter(Boolean) : [];
    
    const d2Ids = dataset2Selection ? [
      ...dataset2Selection.requirements.map((r: any) => r.id),
      ...dataset2Selection.artifacts.map((a: any) => a.id),
      ...dataset2Selection.standards.map((s: any) => s.id),
      ...dataset2Selection.techStacks.map((t: any) => t.id),
      ...dataset2Selection.canvasNodes.map((n: any) => n.id),
      ...dataset2Selection.chatSessions.map((c: any) => c.id),
    ].filter(Boolean) : [];

    // Auto-detect audit mode based on D2 selection
    const auditMode: AuditMode = d2Count === 0 ? "single" : "comparison";

    const config: AuditConfiguration = {
      name: name || `Audit ${new Date().toLocaleDateString()}`,
      description,
      // Audit mode
      auditMode,
      // Legacy fields
      dataset1Type: getPrimaryDatasetType(dataset1Selection),
      dataset1Ids: d1Ids,
      dataset2Type: getPrimaryDatasetType(dataset2Selection),
      dataset2Ids: d2Ids,
      // New content fields
      dataset1Content: dataset1Selection || undefined,
      dataset2Content: dataset2Selection || undefined,
      // Processing settings
      consolidationLevel,
      chunkSize,
      batchSize,
      mappingMode,
      maxConceptsPerElement: mappingMode === "one_to_many" ? maxConceptsPerElement : undefined,
      // Enhanced sort
      enhancedSortEnabled,
      enhancedSortActions: enhancedSortEnabled ? enhancedSortActions : undefined,
    };
    onStartAudit(config);
  };

  const d1Count = countSelectionItems(dataset1Selection);
  const d2Count = countSelectionItems(dataset2Selection);
  const d1Badges = getSelectionBadges(dataset1Selection);
  const d2Badges = getSelectionBadges(dataset2Selection);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Configure Audit Session
            </DialogTitle>
            <DialogDescription>
              Set up the datasets for the audit.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[450px] mt-4">
            <div className="space-y-4 px-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Audit Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Security Requirements Audit"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Dataset 1 */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Dataset 1 (Source of Truth)
                    </Label>
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto min-h-[44px] py-2"
                      onClick={() => setShowSelector1(true)}
                    >
                      {d1Count === 0 ? (
                        <span className="text-muted-foreground">Click to select items...</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {d1Badges.map((badge) => {
                            const Icon = badge.icon;
                            return (
                              <Badge key={badge.label} variant="secondary" className="text-xs">
                                <Icon className="h-3 w-3 mr-1" />
                                {badge.count}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {d1Count} items selected across {d1Badges.length} categories
                    </p>
                  </div>

                  {/* Dataset 2 */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Dataset 2 (Implementation)
                      <Badge variant="outline" className="text-[10px] font-normal">Optional</Badge>
                    </Label>
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto min-h-[44px] py-2"
                      onClick={() => setShowSelector2(true)}
                    >
                      {d2Count === 0 ? (
                        <span className="text-muted-foreground">Leave empty for coverage audit...</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {d2Badges.map((badge) => {
                            const Icon = badge.icon;
                            return (
                              <Badge key={badge.label} variant="secondary" className="text-xs">
                                <Icon className="h-3 w-3 mr-1" />
                                {badge.count}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {d2Count === 0 
                        ? "No D2 = Coverage Audit (single dataset analysis)" 
                        : `${d2Count} items selected across ${d2Badges.length} categories`}
                    </p>
                  </div>
                </div>

                {/* Processing Settings */}
                <div className="border rounded-lg p-4 space-y-4">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Processing Settings
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {/* Consolidation Level */}
                    <div className="space-y-2">
                      <Label htmlFor="consolidation" className="text-xs text-muted-foreground">
                        Consolidation Level
                      </Label>
                      <Select value={consolidationLevel} onValueChange={(v) => setConsolidationLevel(v as ConsolidationLevel)}>
                        <SelectTrigger id="consolidation" className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low (1 round, exact matches)</SelectItem>
                          <SelectItem value="medium">Medium (2 rounds, thematic)</SelectItem>
                          <SelectItem value="high">High (3 rounds, aggressive)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Mapping Mode */}
                    <div className="space-y-2">
                      <Label htmlFor="mapping" className="text-xs text-muted-foreground">
                        Element Mapping
                      </Label>
                      <Select value={mappingMode} onValueChange={(v) => setMappingMode(v as MappingMode)}>
                        <SelectTrigger id="mapping" className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one_to_one">1:1 (strict, one concept each)</SelectItem>
                          <SelectItem value="one_to_many">1:Many (flexible, multi-concept)</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {mappingMode === "one_to_many" && (
                        <div className="mt-2 space-y-1">
                          <Label htmlFor="maxConcepts" className="text-xs text-muted-foreground">
                            Max concepts per element
                          </Label>
                          <Input
                            id="maxConcepts"
                            type="number"
                            min={1}
                            max={20}
                            value={maxConceptsPerElement}
                            onChange={(e) => setMaxConceptsPerElement(Math.min(20, Math.max(1, parseInt(e.target.value) || 10)))}
                            className="h-8 w-24"
                          />
                        </div>
                      )}
                    </div>

                    {/* Chunk Size */}
                    <div className="space-y-2">
                      <Label htmlFor="chunkSize" className="text-xs text-muted-foreground">
                        Chunk Size
                      </Label>
                      <Select value={chunkSize} onValueChange={(v) => setChunkSize(v as ChunkSize)}>
                        <SelectTrigger id="chunkSize" className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Small (10KB per batch)</SelectItem>
                          <SelectItem value="medium">Medium (50KB per batch)</SelectItem>
                          <SelectItem value="large">Large (100KB per batch)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Batch Size */}
                    <div className="space-y-2">
                      <Label htmlFor="batchSize" className="text-xs text-muted-foreground">
                        Batch Size (Elements)
                      </Label>
                      <Select value={batchSize} onValueChange={(v) => setBatchSize(v as BatchSize)}>
                        <SelectTrigger id="batchSize" className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 element max</SelectItem>
                          <SelectItem value="5">5 elements max</SelectItem>
                          <SelectItem value="10">10 elements max</SelectItem>
                          <SelectItem value="50">50 elements max</SelectItem>
                          <SelectItem value="unlimited">Unlimited (char limit only)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    {consolidationLevel === "low" && "Near/exact matches only - precise but may miss related concepts"}
                    {consolidationLevel === "medium" && "Thematic similarity - balances precision with broader grouping"}
                    {consolidationLevel === "high" && "Aggressive consolidation - fewer, broader concept categories"}
                  </p>

                  {/* Enhanced Sort Section */}
                  <div className="border-t pt-4 mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shuffle className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">Enhanced Sort (Post-Merge)</Label>
                      </div>
                      <Switch 
                        checked={enhancedSortEnabled} 
                        onCheckedChange={setEnhancedSortEnabled} 
                      />
                    </div>
                    
                    {enhancedSortEnabled && (
                      <div className="pl-6 space-y-3 animate-in slide-in-from-top-2 duration-200">
                        <p className="text-xs text-muted-foreground">
                          Individually review each element's categorization after merge. This validates placements and allows adjustments.
                        </p>
                        <div className="flex flex-wrap gap-4">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox 
                              checked={enhancedSortActions.move} 
                              onCheckedChange={(checked) => 
                                setEnhancedSortActions(prev => ({ ...prev, move: !!checked }))
                              } 
                            />
                            <span>Move</span>
                            <span className="text-xs text-muted-foreground">(relocate to better fit)</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox 
                              checked={enhancedSortActions.clone} 
                              onCheckedChange={(checked) => 
                                setEnhancedSortActions(prev => ({ ...prev, clone: !!checked }))
                              } 
                            />
                            <span>Clone</span>
                            <span className="text-xs text-muted-foreground">(link to multiple)</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox 
                              checked={enhancedSortActions.create} 
                              onCheckedChange={(checked) => 
                                setEnhancedSortActions(prev => ({ ...prev, create: !!checked }))
                              } 
                            />
                            <span>Create</span>
                            <span className="text-xs text-muted-foreground">(new category)</span>
                          </label>
                        </div>
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          ⚠️ This processes each element individually and may increase processing time.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Selection Summary */}
                {(d1Count > 0 || d2Count > 0) && (
                  <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
                    <p className="text-sm font-medium">Audit Configuration Summary</p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Dataset 1:</p>
                        <p>{d1Count} elements ({getPrimaryDatasetType(dataset1Selection)})</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Dataset 2:</p>
                        <p>{d2Count} elements ({getPrimaryDatasetType(dataset2Selection)})</p>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || d1Count === 0}
              className="gap-2"
            >
              {isLoading ? (
                "Starting..."
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" />
                  {d2Count === 0 ? "Start Coverage Audit" : "Start Comparison Audit"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ProjectSelector for Dataset 1 */}
      <ProjectSelector
        projectId={projectId}
        shareToken={shareToken}
        open={showSelector1}
        onClose={() => setShowSelector1(false)}
        onConfirm={(selection) => {
          setDataset1Selection(selection);
          setShowSelector1(false);
        }}
      />

      {/* ProjectSelector for Dataset 2 */}
      <ProjectSelector
        projectId={projectId}
        shareToken={shareToken}
        open={showSelector2}
        onClose={() => setShowSelector2(false)}
        onConfirm={(selection) => {
          setDataset2Selection(selection);
          setShowSelector2(false);
        }}
      />
    </>
  );
}
