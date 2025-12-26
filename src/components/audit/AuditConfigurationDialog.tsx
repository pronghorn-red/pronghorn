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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Briefcase,
  Code,
  User,
  Building,
  PlayCircle,
  Settings2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

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
  dataset1Type: string;
  dataset1Ids: string[];
  dataset2Type: string;
  dataset2Ids: string[];
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

const datasetTypes = [
  { value: "requirements", label: "Requirements" },
  { value: "canvas_nodes", label: "Canvas Nodes" },
  { value: "artifacts", label: "Artifacts" },
  { value: "repository_files", label: "Repository Files" },
  { value: "standards", label: "Standards" },
  { value: "tech_stacks", label: "Tech Stacks" },
];

interface SelectableItem {
  id: string;
  label: string;
  type?: string;
  children?: SelectableItem[];
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
  const [dataset1Type, setDataset1Type] = useState("requirements");
  const [dataset2Type, setDataset2Type] = useState("repository_files");
  const [maxIterations, setMaxIterations] = useState(100);
  const [personas, setPersonas] = useState<AgentPersona[]>(defaultPersonas);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [consensusRequired, setConsensusRequired] = useState(true);
  
  // Dataset items
  const [dataset1Items, setDataset1Items] = useState<SelectableItem[]>([]);
  const [dataset2Items, setDataset2Items] = useState<SelectableItem[]>([]);
  const [selected1, setSelected1] = useState<Set<string>>(new Set());
  const [selected2, setSelected2] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingItems, setLoadingItems] = useState(false);

  // Load dataset items when type changes
  useEffect(() => {
    if (open && projectId) {
      loadDatasetItems(dataset1Type, setDataset1Items);
      loadDatasetItems(dataset2Type, setDataset2Items);
    }
  }, [open, projectId, dataset1Type, dataset2Type, shareToken]);

  const loadDatasetItems = async (type: string, setter: (items: SelectableItem[]) => void) => {
    setLoadingItems(true);
    try {
      let items: SelectableItem[] = [];
      
      if (type === "requirements") {
        const { data } = await supabase.rpc("get_requirements_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
        });
        items = (data || []).map((r: any) => ({
          id: r.id,
          label: r.code ? `${r.code}: ${r.title || r.text?.slice(0, 40)}` : r.title || r.text?.slice(0, 40),
          type: r.type,
        }));
      } else if (type === "canvas_nodes") {
        const { data } = await supabase.rpc("get_canvas_nodes_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
        });
        items = (data || []).map((n: any) => ({
          id: n.id,
          label: n.data?.label || n.type,
          type: n.type,
        }));
      } else if (type === "artifacts") {
        const { data } = await supabase.rpc("get_artifacts_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
        });
        items = (data || []).map((a: any) => ({
          id: a.id,
          label: a.ai_title || a.content?.slice(0, 40) || "Untitled",
        }));
      } else if (type === "standards") {
        const { data } = await supabase.rpc("get_project_standards_with_token", {
          p_project_id: projectId,
          p_token: shareToken || "",
        });
        if (Array.isArray(data)) {
          items = data.map((s: any) => ({
            id: s.standard_id || s.id,
            label: s.name || s.title || "Untitled",
          }));
        }
      } else if (type === "repository_files") {
        const { data: repos } = await supabase.rpc("get_project_repos_with_token", {
          p_project_id: projectId,
          p_token: shareToken || "",
        });
        const repoList = Array.isArray(repos) ? repos : [];
        if (repoList[0]) {
          const { data: files } = await supabase.rpc("get_repo_files_with_token", {
            p_repo_id: repoList[0].id,
            p_token: shareToken || "",
          });
          if (Array.isArray(files)) {
            items = files.map((f: any) => ({
              id: f.id,
              label: f.path,
              type: f.type,
            }));
          }
        }
      }
      
      setter(items);
    } catch (err) {
      console.error("Failed to load dataset items:", err);
    } finally {
      setLoadingItems(false);
    }
  };

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

  const toggleItem = (id: string, selectedSet: Set<string>, setter: (s: Set<string>) => void) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const selectAll = (items: SelectableItem[], setter: (s: Set<string>) => void) => {
    setter(new Set(items.map((i) => i.id)));
  };

  const selectNone = (setter: (s: Set<string>) => void) => {
    setter(new Set());
  };

  const handleSubmit = () => {
    const config: AuditConfiguration = {
      name: name || `Audit ${new Date().toLocaleDateString()}`,
      description,
      dataset1Type,
      dataset1Ids: Array.from(selected1),
      dataset2Type,
      dataset2Ids: Array.from(selected2),
      maxIterations,
      agentPersonas: personas.filter((p) => p.enabled),
      confidenceThreshold,
      consensusRequired,
    };
    onStartAudit(config);
  };

  const enabledCount = personas.filter((p) => p.enabled).length;

  const renderItemList = (
    items: SelectableItem[],
    selectedSet: Set<string>,
    setter: (s: Set<string>) => void,
    label: string
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => selectAll(items, setter)}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={() => selectNone(setter)}>
            Clear
          </Button>
        </div>
      </div>
      <div className="border rounded-lg max-h-48 overflow-auto p-2 space-y-1">
        {loadingItems ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No items found</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded">
              <Checkbox
                id={item.id}
                checked={selectedSet.has(item.id)}
                onCheckedChange={() => toggleItem(item.id, selectedSet, setter)}
              />
              <label htmlFor={item.id} className="text-sm flex-1 cursor-pointer truncate">
                {item.label}
              </label>
              {item.type && (
                <Badge variant="outline" className="text-[10px]">
                  {item.type}
                </Badge>
              )}
            </div>
          ))
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {selectedSet.size} of {items.length} selected
      </p>
    </div>
  );

  return (
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
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Dataset 1 Type (Source of Truth)</Label>
                    <Select value={dataset1Type} onValueChange={(v) => { setDataset1Type(v); setSelected1(new Set()); }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {datasetTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {renderItemList(dataset1Items, selected1, setSelected1, "Select Items")}
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Dataset 2 Type (Implementation)</Label>
                    <Select value={dataset2Type} onValueChange={(v) => { setDataset2Type(v); setSelected2(new Set()); }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {datasetTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {renderItemList(dataset2Items, selected2, setSelected2, "Select Items")}
                </div>
              </div>
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
                    <span className="text-sm font-medium">{maxIterations}</span>
                  </div>
                  <Slider
                    value={[maxIterations]}
                    onValueChange={(v) => setMaxIterations(v[0])}
                    min={10}
                    max={500}
                    step={10}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum agent iterations before forcing completion
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Confidence Threshold</Label>
                    <span className="text-sm font-medium">
                      {Math.round(confidenceThreshold * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[confidenceThreshold]}
                    onValueChange={(v) => setConfidenceThreshold(v[0])}
                    min={0.5}
                    max={1}
                    step={0.05}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Minimum confidence required for findings
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label>Require Consensus</Label>
                    <p className="text-xs text-muted-foreground">
                      All agents must agree before finalizing results
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
            disabled={isLoading || selected1.size === 0}
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            {isLoading ? "Starting..." : `Start Audit (${selected1.size} items)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
