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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Shield,
  Briefcase,
  Code,
  User,
  Building,
  PlayCircle,
  Settings2,
} from "lucide-react";

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

export function AuditConfigurationDialog({
  open,
  onOpenChange,
  onStartAudit,
  isLoading = false,
}: AuditConfigurationDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dataset1Type, setDataset1Type] = useState("requirements");
  const [dataset2Type, setDataset2Type] = useState("repository_files");
  const [maxIterations, setMaxIterations] = useState(10);
  const [personas, setPersonas] = useState<AgentPersona[]>(defaultPersonas);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [consensusRequired, setConsensusRequired] = useState(true);

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
    const config: AuditConfiguration = {
      name: name || `Audit ${new Date().toLocaleDateString()}`,
      description,
      dataset1Type,
      dataset1Ids: [], // Will be populated by ProjectSelector in parent
      dataset2Type,
      dataset2Ids: [], // Will be populated by ProjectSelector in parent
      maxIterations,
      agentPersonas: personas.filter((p) => p.enabled),
      confidenceThreshold,
      consensusRequired,
    };
    onStartAudit(config);
  };

  const enabledCount = personas.filter((p) => p.enabled).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
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

          <ScrollArea className="h-[400px] mt-4">
            <TabsContent value="datasets" className="space-y-4 px-1">
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
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the purpose of this audit..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dataset 1 (Source of Truth)</Label>
                  <Select value={dataset1Type} onValueChange={setDataset1Type}>
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
                  <p className="text-xs text-muted-foreground">
                    The reference dataset to compare against
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Dataset 2 (Implementation)</Label>
                  <Select value={dataset2Type} onValueChange={setDataset2Type}>
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
                  <p className="text-xs text-muted-foreground">
                    The dataset to audit for compliance
                  </p>
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> After clicking "Start Audit", you'll be
                  able to select specific items from each dataset using the
                  ProjectSelector.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="agents" className="space-y-4 px-1">
              <p className="text-sm text-muted-foreground">
                Enable or disable agent personas and optionally customize their
                analysis prompts.
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
                            <p className="text-xs text-muted-foreground">
                              {persona.id}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={persona.enabled}
                          onCheckedChange={() => handleTogglePersona(persona.id)}
                        />
                      </div>

                      {persona.enabled && (
                        <div className="mt-3">
                          <Label className="text-xs">
                            Custom Prompt (optional)
                          </Label>
                          <Textarea
                            value={persona.customPrompt || ""}
                            onChange={(e) =>
                              handleUpdatePersonaPrompt(persona.id, e.target.value)
                            }
                            placeholder="Override the default system prompt for this agent..."
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
                    min={1}
                    max={50}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum number of agent iterations before forcing completion
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
          <Button onClick={handleSubmit} disabled={isLoading}>
            <PlayCircle className="h-4 w-4 mr-2" />
            {isLoading ? "Starting..." : "Start Audit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
