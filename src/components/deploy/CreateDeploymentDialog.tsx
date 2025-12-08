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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface CreateDeploymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  shareToken: string | null;
  defaultPlatform: "pronghorn_cloud" | "local";
  onCreated: () => void;
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

const defaultCommands: Record<string, { run: string; build: string }> = {
  node: { run: "npm run dev", build: "npm run build" },
  python: { run: "python main.py", build: "pip install -r requirements.txt" },
  go: { run: "go run main.go", build: "go build -o app" },
  react: { run: "npm run dev", build: "npm run build" },
  vue: { run: "npm run dev", build: "npm run build" },
  tanstack: { run: "npm run dev", build: "npm run build" },
  monorepo: { run: "npm run dev", build: "npm run build" },
};

const CreateDeploymentDialog = ({
  open,
  onOpenChange,
  projectId,
  shareToken,
  defaultPlatform,
  onCreated,
}: CreateDeploymentDialogProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [primeRepoName, setPrimeRepoName] = useState("");
  
  const [form, setForm] = useState({
    name: "",
    environment: "development" as "development" | "staging" | "production",
    platform: defaultPlatform,
    projectType: "node",
    runFolder: "/",
    buildFolder: "dist",
    runCommand: "npm run dev",
    buildCommand: "npm run build",
    branch: "main",
  });

  // Fetch prime repo name for default deployment name
  useEffect(() => {
    const fetchPrimeRepo = async () => {
      if (!projectId) return;
      
      const { data } = await supabase.rpc("get_prime_repo_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      
      if (data && data.length > 0) {
        const repoName = data[0].repo;
        setPrimeRepoName(repoName);
        if (!form.name) {
          setForm(f => ({ ...f, name: repoName }));
        }
      }
    };
    
    if (open) {
      fetchPrimeRepo();
    }
  }, [open, projectId, shareToken]);

  // Update commands when project type changes
  useEffect(() => {
    const commands = defaultCommands[form.projectType];
    if (commands) {
      setForm(f => ({
        ...f,
        runCommand: commands.run,
        buildCommand: commands.build,
      }));
    }
  }, [form.projectType]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Deployment name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc("insert_deployment_with_token", {
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
      });

      if (error) throw error;

      toast.success("Deployment created");
      onOpenChange(false);
      onCreated();
      
      // Reset form
      setForm({
        name: primeRepoName,
        environment: "development",
        platform: defaultPlatform,
        projectType: "node",
        runFolder: "/",
        buildFolder: "dist",
        runCommand: "npm run dev",
        buildCommand: "npm run build",
        branch: "main",
      });
    } catch (error: any) {
      console.error("Error creating deployment:", error);
      toast.error(error.message || "Failed to create deployment");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Deployment</DialogTitle>
          <DialogDescription>
            Configure a new deployment for your project. This will set up the build and run configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Deployment Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="my-app"
            />
            <p className="text-xs text-muted-foreground">
              URL will be: {form.environment !== "production" ? `${form.environment}-` : ""}{form.name || "my-app"}.pronghorn.cloud
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Platform</Label>
              <Select
                value={form.platform}
                onValueChange={(value) => setForm({ ...form, platform: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pronghorn_cloud">Pronghorn Cloud</SelectItem>
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
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
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
              <Label htmlFor="buildFolder">Build Folder</Label>
              <Input
                id="buildFolder"
                value={form.buildFolder}
                onChange={(e) => setForm({ ...form, buildFolder: e.target.value })}
                placeholder="dist"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="runCommand">Run Command</Label>
            <Input
              id="runCommand"
              value={form.runCommand}
              onChange={(e) => setForm({ ...form, runCommand: e.target.value })}
              placeholder="npm run dev"
              className="font-mono text-sm"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="buildCommand">Build Command</Label>
            <Input
              id="buildCommand"
              value={form.buildCommand}
              onChange={(e) => setForm({ ...form, buildCommand: e.target.value })}
              placeholder="npm run build"
              className="font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Deployment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateDeploymentDialog;
