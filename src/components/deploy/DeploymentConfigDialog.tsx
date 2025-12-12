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
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import EnvVarEditor from "./EnvVarEditor";
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
  { value: "static", label: "Static Web App" },
  { value: "tanstack", label: "TanStack (Static)" },
  { value: "monorepo", label: "Monorepo (Full Stack)" },
];

const defaultCommands: Record<string, { run: string; build: string; buildFolder: string }> = {
  node: { run: "node index.js", build: "npm i", buildFolder: "/" },
  python: { run: "python main.py", build: "pip install -r requirements.txt", buildFolder: "/" },
  go: { run: "./app", build: "go build -o app", buildFolder: "/" },
  react: { run: "npx http-server dist -p $PORT", build: "npm i && npm run build", buildFolder: "dist" },
  vue: { run: "npx http-server dist -p $PORT", build: "npm i && npm run build", buildFolder: "dist" },
  static: { run: "npx http-server . -p $PORT", build: "npm i -g http-server", buildFolder: "/" },
  tanstack: { run: "npx http-server dist -p $PORT", build: "npm i && npm run build", buildFolder: "dist" },
  monorepo: { run: "npm run start", build: "npm i && npm run build", buildFolder: "dist" },
};

const DeploymentConfigDialog = ({
  open,
  onOpenChange,
  deployment,
  shareToken,
  onUpdate,
}: DeploymentConfigDialogProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingEnvVars, setIsSyncingEnvVars] = useState(false);
  const [activeTab, setActiveTab] = useState("config");
  const [clearExisting, setClearExisting] = useState(false);
  
  const [form, setForm] = useState({
    name: deployment.name,
    environment: deployment.environment,
    projectType: deployment.project_type,
    runFolder: deployment.run_folder,
    buildFolder: deployment.build_folder,
    buildCommand: deployment.build_command || "",
    runCommand: deployment.run_command,
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
        buildCommand: deployment.build_command || "",
        runCommand: deployment.run_command,
        branch: deployment.branch || "main",
      });
      setEnvVars(
        Object.entries((deployment.env_vars as Record<string, string>) || {}).map(([key, value]) => ({ key, value }))
      );
      setClearExisting(false);
    }
  }, [open, deployment]);

  const handleSyncFromRender = async () => {
    if (!deployment.render_service_id) {
      toast.error("No Render service linked yet");
      return;
    }

    setIsSyncingEnvVars(true);
    try {
      const { data, error } = await supabase.functions.invoke("render-service", {
        body: {
          action: "getEnvVars",
          deploymentId: deployment.id,
          shareToken: shareToken || null,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      const renderEnvVars = data.data || [];
      setEnvVars(renderEnvVars.map((v: { key: string; value: string }) => ({
        key: v.key,
        value: v.value,
      })));
      
      toast.success("Environment variables synced from Render");
    } catch (error: any) {
      console.error("Error syncing env vars:", error);
      toast.error(error.message || "Failed to sync from Render");
    } finally {
      setIsSyncingEnvVars(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Convert env vars array to object for database storage
      const envVarsObj: Record<string, string> = {};
      envVars.forEach(({ key, value }) => {
        if (key.trim()) {
          envVarsObj[key.trim()] = value;
        }
      });

      // Update local database
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

      // If there's a Render service, also update env vars on Render
      if (deployment.render_service_id) {
        const envVarsArray = envVars.filter(v => v.key.trim()).map(v => ({
          key: v.key.trim(),
          value: v.value,
        }));

        const { data: renderData, error: renderError } = await supabase.functions.invoke("render-service", {
          body: {
            action: "updateEnvVars",
            deploymentId: deployment.id,
            shareToken: shareToken || null,
            newEnvVars: envVarsArray,
            clearExisting,
          },
        });

        if (renderError || !renderData?.success) {
          toast.warning("Saved locally, but failed to update Render. Deploy to retry.");
        } else {
          toast.success("Deployment updated. Deploy to apply changes.");
        }
      } else {
        toast.success("Deployment updated");
      }

      onOpenChange(false);
      onUpdate();
    } catch (error: any) {
      console.error("Error updating deployment:", error);
      toast.error(error.message || "Failed to update deployment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasRenderService = !!deployment.render_service_id;

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
            <TabsTrigger value="env">
              Environment Variables
              {envVars.length > 0 && (
                <span className="ml-2 text-xs bg-primary/20 px-1.5 py-0.5 rounded-full">
                  {envVars.length}
                </span>
              )}
            </TabsTrigger>
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
                    <SelectItem value="dev">Dev</SelectItem>
                    <SelectItem value="uat">UAT</SelectItem>
                    <SelectItem value="prod">Prod</SelectItem>
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
              <Label htmlFor="buildCommand">Build Command</Label>
              <Input
                id="buildCommand"
                value={form.buildCommand}
                onChange={(e) => setForm({ ...form, buildCommand: e.target.value })}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Chain multiple commands with &&
              </p>
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
          </TabsContent>

          <TabsContent value="env" className="space-y-4 pt-4">
            {hasRenderService && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span>Sync with Render.com</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncFromRender}
                  disabled={isSyncingEnvVars}
                >
                  {isSyncingEnvVars ? (
                    <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-2" />
                  )}
                  Pull from Render
                </Button>
              </div>
            )}
            
            <EnvVarEditor
              value={envVars}
              onChange={setEnvVars}
              showClearExisting={hasRenderService}
              clearExisting={clearExisting}
              onClearExistingChange={setClearExisting}
            />
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
