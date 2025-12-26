import { useState, useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Briefcase,
  Code,
  User,
  Building,
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
} from "lucide-react";
import { ProjectSelector, ProjectSelectionResult } from "@/components/project/ProjectSelector";

interface AgentPersona {
  id: string;
  label: string;
  icon: React.ElementType;
  enabled: boolean;
  customPrompt?: string;
}

interface AuditConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartAudit: (config: AuditConfiguration) => void;
  isLoading?: boolean;
  projectId: string;
  shareToken: string | null;
}

export interface AuditConfiguration {
  name: string;
  description: string;
  // Legacy fields for backward compatibility
  dataset1Type: string;
  dataset1Ids: string[];
  dataset2Type: string;
  dataset2Ids: string[];
  // New fields for mixed-category selection
  dataset1Content?: ProjectSelectionResult;
  dataset2Content?: ProjectSelectionResult;
  maxIterations: number;
  agentPersonas: AgentPersona[];
  confidenceThreshold: number;
  consensusRequired: boolean;
}

const defaultPersonas: AgentPersona[] = [
  { id: "security_analyst", label: "Security Analyst", icon: Shield, enabled: true },
  { id: "business_analyst", label: "Business Analyst", icon: Briefcase, enabled: true },
  { id: "developer", label: "Developer", icon: Code, enabled: true },
  { id: "end_user", label: "End User", icon: User, enabled: true },
  { id: "architect", label: "Architect", icon: Building, enabled: true },
];

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
  const [maxIterations, setMaxIterations] = useState(100);
  const [personas, setPersonas] = useState<AgentPersona[]>(defaultPersonas);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [consensusRequired, setConsensusRequired] = useState(true);
  
  // ProjectSelector state
  const [dataset1Selection, setDataset1Selection] = useState<ProjectSelectionResult | null>(null);
  const [dataset2Selection, setDataset2Selection] = useState<ProjectSelectionResult | null>(null);
  const [showSelector1, setShowSelector1] = useState(false);
  const [showSelector2, setShowSelector2] = useState(false);

  const handleTogglePersona = (id: string) => {
    setPersonas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  };

  const handleUpdatePersonaPrompt = (id: string, prompt: string) => {
    setPersonas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, customPrompt: prompt } : p))
    );
  };

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

    const config: AuditConfiguration = {
      name: name || `Audit ${new Date().toLocaleDateString()}`,
      description,
      // Legacy fields
      dataset1Type: getPrimaryDatasetType(dataset1Selection),
      dataset1Ids: d1Ids,
      dataset2Type: getPrimaryDatasetType(dataset2Selection),
      dataset2Ids: d2Ids,
      // New content fields
      dataset1Content: dataset1Selection || undefined,
      dataset2Content: dataset2Selection || undefined,
      maxIterations,
      agentPersonas: personas.filter((p) => p.enabled),
      confidenceThreshold,
      consensusRequired,
    };
    onStartAudit(config);
  };

  const enabledCount = personas.filter((p) => p.enabled).length;
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
              Set up the datasets, agent personas, and parameters for the audit.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="datasets" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="datasets">Datasets</TabsTrigger>
              <TabsTrigger value="agents">
                Agents
                <Badge variant="secondary" className="ml-2 text-xs">
                  {enabledCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[450px] mt-4">
              <TabsContent value="datasets" className="space-y-4 px-1">
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
                    </Label>
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto min-h-[44px] py-2"
                      onClick={() => setShowSelector2(true)}
                    >
                      {d2Count === 0 ? (
                        <span className="text-muted-foreground">Click to select items...</span>
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
                      {d2Count} items selected across {d2Badges.length} categories
                    </p>
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
              </TabsContent>

              <TabsContent value="agents" className="space-y-4 px-1">
                <p className="text-sm text-muted-foreground">
                  Enable or disable agent personas and optionally customize their analysis prompts.
                </p>

                <div className="space-y-3">
                  {personas.map((persona) => {
                    const Icon = persona.icon;
                    return (
                      <div
                        key={persona.id}
                        className={`border rounded-lg p-4 transition-colors ${
                          persona.enabled ? "bg-card" : "bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`p-2 rounded-md ${
                                persona.enabled
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium">{persona.label}</p>
                              <p className="text-xs text-muted-foreground">{persona.id}</p>
                            </div>
                          </div>
                          <Switch
                            checked={persona.enabled}
                            onCheckedChange={() => handleTogglePersona(persona.id)}
                          />
                        </div>

                        {persona.enabled && (
                          <div className="mt-3">
                            <Label className="text-xs">Custom Prompt (optional)</Label>
                            <Textarea
                              value={persona.customPrompt || ""}
                              onChange={(e) => handleUpdatePersonaPrompt(persona.id, e.target.value)}
                              placeholder="Override the default system prompt..."
                              className="mt-1 text-sm"
                              rows={2}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="settings" className="space-y-6 px-1">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Max Iterations</Label>
                      <span className="text-sm text-muted-foreground">{maxIterations}</span>
                    </div>
                    <Slider
                      value={[maxIterations]}
                      onValueChange={([v]) => setMaxIterations(v)}
                      min={10}
                      max={500}
                      step={10}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Maximum discussion rounds before forcing consensus
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Confidence Threshold</Label>
                      <span className="text-sm text-muted-foreground">
                        {(confidenceThreshold * 100).toFixed(0)}%
                      </span>
                    </div>
                    <Slider
                      value={[confidenceThreshold]}
                      onValueChange={([v]) => setConfidenceThreshold(v)}
                      min={0.5}
                      max={1}
                      step={0.05}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Minimum confidence for an agent to assert a finding
                    </p>
                  </div>

                  <div className="flex items-center justify-between py-3 px-1">
                    <div>
                      <Label>Require Consensus</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        All agents must agree before finalizing
                      </p>
                    </div>
                    <Switch
                      checked={consensusRequired}
                      onCheckedChange={setConsensusRequired}
                    />
                  </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || (d1Count === 0 && d2Count === 0)}
              className="gap-2"
            >
              {isLoading ? (
                "Starting..."
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" />
                  Start Audit
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
