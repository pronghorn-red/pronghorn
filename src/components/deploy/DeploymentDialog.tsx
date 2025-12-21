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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, HardDrive, Lock } from "lucide-react";
import EnvVarEditor from "./EnvVarEditor";
import { getDeploymentSecrets, setDeploymentSecrets } from "@/lib/deploymentSecrets";
import type { Database } from "@/integrations/supabase/types";

type Deployment = Database["public"]["Tables"]["project_deployments"]["Row"];

interface DeploymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  shareToken: string | null;
  mode: "create" | "edit";
  deployment?: Deployment;
  defaultPlatform?: "pronghorn_cloud" | "local";
  onSuccess: () => void;
}

interface ProjectTypeConfig {
  value: string;
  label: string;
  renderType: "web_service" | "static_site";
  runtime: string | null;
  buildCommand: string;
  runCommand: string | null;
  buildFolder: string;
  runFolder: string;
  publishPath?: string;
  description?: string;
}

interface DeploymentSettings {
  projectTypes: ProjectTypeConfig[];
  runtimes: string[];
}

const DeploymentDialog = ({
  open,
  onOpenChange,
  projectId,
  shareToken,
  mode,
  deployment,
  defaultPlatform = "pronghorn_cloud",
  onSuccess,
}: DeploymentDialogProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingEnvVars, setIsSyncingEnvVars] = useState(false);
  const [isLoadingSecrets, setIsLoadingSecrets] = useState(false);
  const [primeRepoName, setPrimeRepoName] = useState("");
  
  // Generate a random 4-character alphanumeric ID
  const generateUniqueId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };
  
  const generateDeploymentName = (repoName: string) => {
    const baseName = repoName || 'deployment';
    return `${baseName}-service-${generateUniqueId()}`;
  };
  const [activeTab, setActiveTab] = useState("config");
  const [clearExisting, setClearExisting] = useState(false);
  const [originalKeys, setOriginalKeys] = useState<Set<string>>(new Set());
  const [projectTypes, setProjectTypes] = useState<ProjectTypeConfig[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [form, setForm] = useState({
    name: "",
    environment: "dev" as "dev" | "uat" | "prod",
    platform: defaultPlatform as "pronghorn_cloud" | "local",
    projectType: "static",
    runFolder: "/",
    buildFolder: "/",
    buildCommand: "",
    runCommand: "",
    branch: "main",
    diskEnabled: false,
    diskName: "",
    diskMountPath: "/data",
    diskSizeGB: 1,
  });

  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);

  // Load deployment settings from JSON
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/data/deploymentSettings.json");
        if (response.ok) {
          const settings: DeploymentSettings = await response.json();
          setProjectTypes(settings.projectTypes);
          setSettingsLoaded(true);
        }
      } catch (error) {
        console.error("Failed to load deployment settings:", error);
        // Fallback to defaults
        setProjectTypes([
          { value: "node", label: "Node.js Backend", renderType: "web_service", runtime: "node", buildCommand: "npm install", runCommand: "node index.js", buildFolder: "/", runFolder: "/" },
        ]);
        setSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // Initialize form based on mode
  useEffect(() => {
    if (!open || !settingsLoaded) return;

    if (mode === "edit" && deployment) {
      // Edit mode: load deployment data
      setForm({
        name: deployment.name,
        environment: deployment.environment as "dev" | "uat" | "prod",
        platform: deployment.platform as "pronghorn_cloud" | "local",
        projectType: deployment.project_type,
        runFolder: deployment.run_folder,
        buildFolder: deployment.build_folder,
        buildCommand: deployment.build_command || "",
        runCommand: deployment.run_command,
        branch: deployment.branch || "main",
        diskEnabled: (deployment as any).disk_enabled || false,
        diskName: (deployment as any).disk_name || "",
        diskMountPath: (deployment as any).disk_mount_path || "/data",
        diskSizeGB: (deployment as any).disk_size_gb || 1,
      });
      
      // Load encrypted env vars (owner only - will fail silently for non-owners)
      loadEncryptedSecrets(deployment.id);
      
      setClearExisting(false);
    } else {
      // Create mode: reset form and fetch prime repo
      const defaultType = projectTypes.find(t => t.value === "static") || projectTypes[0];
      if (defaultType) {
      setForm({
          name: generateDeploymentName(primeRepoName),
          environment: "dev",
          platform: defaultPlatform,
          projectType: defaultType.value,
          runFolder: defaultType.runFolder,
          buildFolder: defaultType.buildFolder,
          buildCommand: defaultType.buildCommand,
          runCommand: defaultType.runCommand || "",
          branch: "main",
          diskEnabled: false,
          diskName: "",
          diskMountPath: "/data",
          diskSizeGB: 1,
        });
      }
      setEnvVars([]);
      setOriginalKeys(new Set());
      setActiveTab("config");
    }
  }, [open, mode, deployment, defaultPlatform, primeRepoName, settingsLoaded, projectTypes]);

  // Load encrypted secrets for edit mode
  const loadEncryptedSecrets = async (deploymentId: string) => {
    setIsLoadingSecrets(true);
    try {
      const { envVars: decryptedEnvVars } = await getDeploymentSecrets(deploymentId, shareToken);
      
      if (decryptedEnvVars && Object.keys(decryptedEnvVars).length > 0) {
        const envVarsArray = Object.entries(decryptedEnvVars).map(([key, value]) => ({
          key,
          value,
        }));
        setEnvVars(envVarsArray);
        setOriginalKeys(new Set(Object.keys(decryptedEnvVars)));
      } else {
        // Fallback: load keys from deployment.env_vars (for backwards compatibility)
        const storedEnvVars = deployment?.env_vars as Record<string, boolean> | null;
        if (storedEnvVars) {
          const keys = Object.keys(storedEnvVars);
          setOriginalKeys(new Set(keys));
          setEnvVars(keys.map((key) => ({ key, value: "" })));
        } else {
          setOriginalKeys(new Set());
          setEnvVars([]);
        }
      }
    } catch (error) {
      console.log("[DeploymentDialog] Could not load encrypted secrets (may not be owner):", error);
      // Fallback: load keys only from deployment.env_vars
      const storedEnvVars = deployment?.env_vars as Record<string, boolean> | null;
      if (storedEnvVars) {
        const keys = Object.keys(storedEnvVars);
        setOriginalKeys(new Set(keys));
        setEnvVars(keys.map((key) => ({ key, value: "" })));
      } else {
        setOriginalKeys(new Set());
        setEnvVars([]);
      }
    } finally {
      setIsLoadingSecrets(false);
    }
  };

  // Fetch prime repo name for default deployment name (create mode only)
  useEffect(() => {
    const fetchPrimeRepo = async () => {
      if (!projectId || mode !== "create") return;

      const { data } = await supabase.rpc("get_prime_repo_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (data && data.length > 0) {
        const repoName = data[0].repo;
        setPrimeRepoName(repoName);
        if (!form.name) {
          setForm((f) => ({ ...f, name: repoName }));
        }
      }
    };

    if (open) {
      fetchPrimeRepo();
    }
  }, [open, projectId, shareToken, mode]);

  // Update commands when project type changes (create mode only)
  useEffect(() => {
    if (mode !== "create" || !settingsLoaded) return;
    
    const typeConfig = projectTypes.find(t => t.value === form.projectType);
    if (typeConfig) {
      setForm((f) => ({
        ...f,
        runCommand: typeConfig.runCommand || "",
        buildCommand: typeConfig.buildCommand,
        buildFolder: typeConfig.buildFolder,
        runFolder: typeConfig.runFolder,
      }));
    }
  }, [form.projectType, mode, settingsLoaded, projectTypes]);

  const handleSyncFromRender = async () => {
    if (!deployment?.render_service_id) {
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
      setEnvVars(
        renderEnvVars.map((v: { key: string; value: string }) => ({
          key: v.key,
          value: v.value,
        }))
      );

      toast.success("Environment variables pulled from Render");
    } catch (error: any) {
      console.error("Error syncing env vars:", error);
      toast.error(error.message || "Failed to pull from Render");
    } finally {
      setIsSyncingEnvVars(false);
    }
  };

  const handleSubmit = async () => {
    if (form.diskEnabled && !form.diskName.trim()) {
      toast.error("Disk name is required when disk mounting is enabled");
      return;
    }

    setIsSubmitting(true);
    try {
      // Build env vars - store keys in database for reference
      const envVarsKeysOnly: Record<string, boolean> = {};
      const envVarsArray = envVars.filter((v) => v.key.trim());
      envVarsArray.forEach(({ key }) => {
        envVarsKeysOnly[key.trim()] = true;
      });

      // Build env vars object with values for encrypted storage
      const envVarsWithValuesObj: Record<string, string> = {};
      envVarsArray.forEach(({ key, value }) => {
        if (key.trim()) {
          envVarsWithValuesObj[key.trim()] = value;
        }
      });

      // Get env vars with values (for Render)
      const envVarsWithValues = envVarsArray
        .filter((v) => v.value)
        .map((v) => ({ key: v.key.trim(), value: v.value }));

      // Detect deleted keys (keys in original but not in current)
      const currentKeys = new Set(envVarsArray.map((v) => v.key.trim()));
      const deletedKeys = [...originalKeys].filter((k) => !currentKeys.has(k));

      if (mode === "create") {
        // Create new deployment - store keys in DB
        const { data: newDeployment, error } = await supabase.rpc("insert_deployment_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null,
          p_name: form.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          p_environment: form.environment,
          p_platform: form.platform as "pronghorn_cloud" | "local" | "dedicated_vm",
          p_project_type: form.projectType,
          p_run_folder: form.runFolder,
          p_build_folder: form.buildFolder,
          p_run_command: form.runCommand,
          p_build_command: form.buildCommand,
          p_branch: form.branch,
          p_env_vars: envVarsKeysOnly,
          p_disk_enabled: form.diskEnabled,
          p_disk_name: form.diskEnabled ? form.diskName : null,
          p_disk_mount_path: form.diskEnabled ? form.diskMountPath : "/data",
          p_disk_size_gb: form.diskEnabled ? form.diskSizeGB : 1,
        });

        if (error) throw error;

        // Save encrypted env vars with values
        if (newDeployment && Object.keys(envVarsWithValuesObj).length > 0) {
          try {
            await setDeploymentSecrets(newDeployment.id, shareToken, {
              envVars: envVarsWithValuesObj,
            });
          } catch (secretError) {
            console.error("Failed to save encrypted env vars:", secretError);
            // Don't fail the whole operation, just warn
            toast.warning("Deployment created but env var encryption failed");
          }
        }

        // If cloud deployment with env vars, create service immediately with env vars
        if (form.platform === "pronghorn_cloud" && envVarsWithValues.length > 0 && newDeployment) {
          const { data: renderData, error: renderError } = await supabase.functions.invoke(
            "render-service",
            {
              body: {
                action: "create",
                deploymentId: newDeployment.id,
                shareToken: shareToken || null,
                envVars: envVarsWithValues,
              },
            }
          );

          if (renderError || !renderData?.success) {
            toast.warning("Deployment saved. Use 'Create Service' to provision with env vars.");
          } else {
            toast.success("Deployment created and service provisioned with env vars");
          }
        } else {
          toast.success("Deployment created");
        }
      } else if (mode === "edit" && deployment) {
        // Update deployment - store keys in DB
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
          p_env_vars: envVarsKeysOnly,
          p_disk_enabled: form.diskEnabled,
          p_disk_name: form.diskEnabled ? form.diskName : null,
          p_disk_mount_path: form.diskEnabled ? form.diskMountPath : "/data",
          p_disk_size_gb: form.diskEnabled ? form.diskSizeGB : 1,
        });

        if (error) throw error;

        // Save encrypted env vars with values
        try {
          await setDeploymentSecrets(deployment.id, shareToken, {
            envVars: envVarsWithValuesObj,
          });
        } catch (secretError) {
          console.error("Failed to save encrypted env vars:", secretError);
          toast.warning("Deployment updated but env var encryption failed");
        }

        // If Render service exists, sync config AND env vars
        if (deployment.render_service_id) {
          let syncSuccess = true;

          // Sync service configuration (build/run commands)
          const { error: configError } = await supabase.functions.invoke("render-service", {
            body: {
              action: "updateServiceConfig",
              deploymentId: deployment.id,
              shareToken: shareToken || null,
            },
          });

          if (configError) {
            console.error("Config sync error:", configError);
            syncSuccess = false;
          }

          // Sync env vars (add/update/delete)
          if (envVarsWithValues.length > 0 || deletedKeys.length > 0) {
            const { error: envError } = await supabase.functions.invoke("render-service", {
              body: {
                action: "syncEnvVars",
                deploymentId: deployment.id,
                shareToken: shareToken || null,
                newEnvVars: envVarsWithValues,
                keysToDelete: deletedKeys,
              },
            });

            if (envError) {
              console.error("Env sync error:", envError);
              syncSuccess = false;
            }
          }

          if (syncSuccess) {
            const msg = deletedKeys.length > 0 
              ? `Updated and synced. ${deletedKeys.length} key(s) deleted.`
              : "Deployment updated and synced to Render.";
            toast.success(msg);
          } else {
            toast.warning("Saved locally, but some changes may not have synced to Render");
          }
        } else {
          toast.success("Deployment updated");
        }
      }

      onOpenChange(false);
      onSuccess();

      // Reset form for create mode
      if (mode === "create") {
        const defaultType = projectTypes.find(t => t.value === "static") || projectTypes[0];
        if (defaultType) {
          setForm({
            name: generateDeploymentName(primeRepoName),
            environment: "dev",
            platform: defaultPlatform,
            projectType: defaultType.value,
            runFolder: defaultType.runFolder,
            buildFolder: defaultType.buildFolder,
            buildCommand: defaultType.buildCommand,
            runCommand: defaultType.runCommand || "",
            branch: "main",
            diskEnabled: false,
            diskName: "",
            diskMountPath: "/data",
            diskSizeGB: 1,
          });
        }
        setEnvVars([]);
        setActiveTab("config");
      }
    } catch (error: any) {
      console.error("Error saving deployment:", error);
      toast.error(error.message || "Failed to save deployment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasRenderService = mode === "edit" && deployment?.render_service_id;
  const isEditMode = mode === "edit";
  const currentTypeConfig = projectTypes.find(t => t.value === form.projectType);
  const isStaticSite = currentTypeConfig?.renderType === "static_site";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] h-[90vh] max-w-[90vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0 flex-shrink-0">
          <DialogTitle>
            {isEditMode ? "Deployment Configuration" : "Create Deployment"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? `Configure settings for ${deployment?.name}`
              : "Configure a new deployment for your project."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 px-6">
          <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="env">
              Environment Variables
              {envVars.length > 0 && (
                <span className="ml-2 text-xs bg-primary/20 px-1.5 py-0.5 rounded-full">
                  {envVars.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="disk">
              <HardDrive className="h-4 w-4 mr-1.5" />
              Disk
              {form.diskEnabled && (
                <span className="ml-1.5 text-xs bg-primary/20 px-1.5 py-0.5 rounded-full">
                  {form.diskSizeGB}GB
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto min-h-0 py-4">
            <TabsContent value="config" className="space-y-4 mt-0 h-full">
              {/* Deployment Name */}
              <div className="grid gap-2">
                <Label htmlFor="name">Deployment Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  readOnly
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-generated from repository name
                </p>
                {form.platform === "pronghorn_cloud" && (
                  <p className="text-xs text-muted-foreground">
                    URL will be: {form.environment}-{form.name || "my-app"}.onrender.com
                  </p>
                )}
              </div>

              {/* Platform + Environment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Platform</Label>
                  <Select
                    value={form.platform}
                    onValueChange={(value) => setForm({ ...form, platform: value as any })}
                    disabled={isEditMode}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pronghorn_cloud">Render.com</SelectItem>
                      <SelectItem value="local">Local Development</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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
              </div>

              {/* Project Type + Branch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  {currentTypeConfig?.description && (
                    <p className="text-xs text-muted-foreground">{currentTypeConfig.description}</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    value={form.branch}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                    placeholder="main"
                  />
                </div>
              </div>

              {/* Run Folder + Build Folder */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="runFolder">Run Folder</Label>
                  <Input
                    id="runFolder"
                    value={form.runFolder}
                    onChange={(e) => setForm({ ...form, runFolder: e.target.value })}
                    placeholder="/"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="buildFolder">{isStaticSite ? "Publish Path" : "Build Folder"}</Label>
                  <Input
                    id="buildFolder"
                    value={form.buildFolder}
                    onChange={(e) => setForm({ ...form, buildFolder: e.target.value })}
                    placeholder="dist"
                  />
                </div>
              </div>

              {/* Build Command */}
              <div className="grid gap-2">
                <Label htmlFor="buildCommand">Build Command</Label>
                <Input
                  id="buildCommand"
                  value={form.buildCommand}
                  onChange={(e) => setForm({ ...form, buildCommand: e.target.value })}
                  placeholder="npm install && npm run build"
                />
                <p className="text-xs text-muted-foreground">
                  Chain multiple commands with &&
                </p>
              </div>

              {/* Run Command - only for web services */}
              {!isStaticSite && (
                <div className="grid gap-2">
                  <Label htmlFor="runCommand">Run Command</Label>
                  <Input
                    id="runCommand"
                    value={form.runCommand}
                    onChange={(e) => setForm({ ...form, runCommand: e.target.value })}
                    placeholder="npm start"
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="env" className="space-y-4 mt-0 h-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-base">Environment Variables</Label>
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                {hasRenderService && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncFromRender}
                    disabled={isSyncingEnvVars}
                  >
                    {isSyncingEnvVars ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Pull from Render
                  </Button>
                )}
              </div>

              {isLoadingSecrets ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading encrypted variables...</span>
                </div>
              ) : (
                <EnvVarEditor
                  value={envVars}
                  onChange={setEnvVars}
                />
              )}

              {hasRenderService && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  <input
                    type="checkbox"
                    id="clearExisting"
                    checked={clearExisting}
                    onChange={(e) => setClearExisting(e.target.checked)}
                    className="rounded border-input"
                  />
                  <Label htmlFor="clearExisting" className="text-sm font-normal">
                    Clear existing variables on Render before sync
                  </Label>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Environment variables are encrypted at rest. Values are decrypted for owners only.
              </p>
            </TabsContent>

            <TabsContent value="disk" className="space-y-4 mt-0 h-full">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable Disk Mount</Label>
                  <p className="text-sm text-muted-foreground">
                    Attach persistent storage to your service
                  </p>
                </div>
                <Switch
                  checked={form.diskEnabled}
                  onCheckedChange={(checked) => setForm({ ...form, diskEnabled: checked })}
                />
              </div>

              {form.diskEnabled && (
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="grid gap-2">
                    <Label htmlFor="diskName">Disk Name *</Label>
                    <Input
                      id="diskName"
                      value={form.diskName}
                      onChange={(e) => setForm({ ...form, diskName: e.target.value })}
                      placeholder="my-disk"
                    />
                    <p className="text-xs text-muted-foreground">
                      A unique name for this disk
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="diskMountPath">Mount Path *</Label>
                    <Input
                      id="diskMountPath"
                      value={form.diskMountPath}
                      onChange={(e) => setForm({ ...form, diskMountPath: e.target.value })}
                      placeholder="/data"
                    />
                    <p className="text-xs text-muted-foreground">
                      Where the disk will be mounted in your container
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="diskSizeGB">Size (GB)</Label>
                    <Input
                      id="diskSizeGB"
                      type="number"
                      min={1}
                      value={form.diskSizeGB}
                      onChange={(e) => setForm({ ...form, diskSizeGB: parseInt(e.target.value) || 1 })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum 1 GB. Additional costs apply for disk storage.
                    </p>
                  </div>
                </div>
              )}

              {!form.diskEnabled && (
                <div className="text-center text-muted-foreground py-8">
                  <HardDrive className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No disk configured</p>
                  <p className="text-sm">Enable disk mounting to attach persistent storage</p>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="p-6 pt-0 flex-shrink-0 border-t mt-0 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditMode ? "Save Changes" : "Create Deployment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeploymentDialog;
