import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Deployment = Database["public"]["Tables"]["project_deployments"]["Row"];

interface DeploymentConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deployment: Deployment;
  shareToken: string | null;
  onUpdate: () => void;
}

const projectTypes = [
  { value: "node", label: "Node.js Backend" },
  { value: "python", label: "Python Backend" },
  { value: "go", label: "Go Backend" },
  { value: "react", label: "React (Vite)" },
  { value: "vue", label: "Vue (Vite)" },
  { value: "tanstack", label: "TanStack (Static)" },
  { value: "monorepo", label: "Monorepo (Full Stack)" },
];

const DeploymentConfigDialog = ({
  open,
  onOpenChange,
  deployment,
  shareToken,
  onUpdate,
}: DeploymentConfigDialogProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("config");
  
  const [form, setForm] = useState({
    name: deployment.name,
    environment: deployment.environment,
    projectType: deployment.project_type,
    runFolder: deployment.run_folder,
    buildFolder: deployment.build_folder,
    runCommand: deployment.run_command,
    buildCommand: deployment.build_command || "",
    branch: deployment.branch || "main",
  });

  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>(
    Object.entries((deployment.env_vars as Record<string, string>) || {}).map(([key, value]) => ({ key, value }))
  );

  useEffect(() => {
    if (open) {
      setForm({
        name: deployment.name,
        environment: deployment.environment,
        projectType: deployment.project_type,
        runFolder: deployment.run_folder,
        buildFolder: deployment.build_folder,
        runCommand: deployment.run_command,
        buildCommand: deployment.build_command || "",
        branch: deployment.branch || "main",
      });
      setEnvVars(
        Object.entries((deployment.env_vars as Record<string, string>) || {}).map(([key, value]) => ({ key, value }))
      );
    }
  }, [open, deployment]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Convert env vars array to object
      const envVarsObj: Record<string, string> = {};
      envVars.forEach(({ key, value }) => {
        if (key.trim()) {
          envVarsObj[key.trim()] = value;
        }
      });

      const { error } = await supabase.rpc("update_deployment_with_token", {
        p_deployment_id: deployment.id,
        p_token: shareToken || null,
        p_name: form.name,
        p_environment: form.environment as any,
        p_project_type: form.projectType,
        p_run_folder: form.runFolder,
        p_build_folder: form.buildFolder,
        p_run_command: form.runCommand,
        p_build_command: form.buildCommand,
        p_branch: form.branch,
        p_env_vars: envVarsObj,
      });

      if (error) throw error;

      toast.success("Deployment updated");
      onOpenChange(false);
      onUpdate();
    } catch (error: any) {
      console.error("Error updating deployment:", error);
      toast.error(error.message || "Failed to update deployment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "" }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const updateEnvVar = (index: number, field: "key" | "value", value: string) => {
    const updated = [...envVars];
    updated[index][field] = value;
    setEnvVars(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deployment Configuration</DialogTitle>
          <DialogDescription>
            Configure build settings and environment variables for {deployment.name}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="env">Environment Variables</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-4 pt-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Deployment Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Environment</Label>
                <Select
                  value={form.environment}
                  onValueChange={(value) => setForm({ ...form, environment: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Project Type</Label>
                <Select
                  value={form.projectType}
                  onValueChange={(value) => setForm({ ...form, projectType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projectTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="runFolder">Run Folder</Label>
                <Input
                  id="runFolder"
                  value={form.runFolder}
                  onChange={(e) => setForm({ ...form, runFolder: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="buildFolder">Build Folder</Label>
                <Input
                  id="buildFolder"
                  value={form.buildFolder}
                  onChange={(e) => setForm({ ...form, buildFolder: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="branch">Branch</Label>
              <Input
                id="branch"
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="runCommand">Run Command</Label>
              <Input
                id="runCommand"
                value={form.runCommand}
                onChange={(e) => setForm({ ...form, runCommand: e.target.value })}
                className="font-mono text-sm"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="buildCommand">Build Command</Label>
              <Input
                id="buildCommand"
                value={form.buildCommand}
                onChange={(e) => setForm({ ...form, buildCommand: e.target.value })}
                className="font-mono text-sm"
              />
            </div>
          </TabsContent>

          <TabsContent value="env" className="space-y-4 pt-4">
            <div className="space-y-3">
              {envVars.map((envVar, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="KEY"
                    value={envVar.key}
                    onChange={(e) => updateEnvVar(index, "key", e.target.value)}
                    className="font-mono text-sm flex-1"
                  />
                  <Input
                    placeholder="value"
                    value={envVar.value}
                    onChange={(e) => updateEnvVar(index, "value", e.target.value)}
                    className="font-mono text-sm flex-[2]"
                    type="password"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEnvVar(index)}
                    className="h-9 w-9 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            
            <Button variant="outline" size="sm" onClick={addEnvVar}>
              <Plus className="h-4 w-4 mr-2" />
              Add Variable
            </Button>
            
            <p className="text-xs text-muted-foreground">
              Environment variables are encrypted and only visible to project owners.
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeploymentConfigDialog;
