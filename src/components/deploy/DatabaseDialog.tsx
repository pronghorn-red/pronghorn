import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Loader2, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  database?: any;
  projectId: string;
  shareToken: string | null;
  onSuccess: () => void;
}

const PLANS = [
  { value: "starter", label: "Starter", enabled: true },
  { value: "standard", label: "Standard", enabled: true },
  { value: "free", label: "Free", enabled: false },
  { value: "pro", label: "Pro", enabled: false },
  { value: "pro_plus", label: "Pro Plus", enabled: false },
  { value: "basic_256mb", label: "Basic 256MB", enabled: false },
  { value: "basic_1gb", label: "Basic 1GB", enabled: false },
  { value: "basic_4gb", label: "Basic 4GB", enabled: false },
  { value: "pro_4gb", label: "Pro 4GB", enabled: false },
  { value: "pro_8gb", label: "Pro 8GB", enabled: false },
];

const REGIONS = [
  { value: "oregon", label: "Oregon (US West)" },
  { value: "ohio", label: "Ohio (US East)" },
  { value: "virginia", label: "Virginia (US East)" },
  { value: "frankfurt", label: "Frankfurt (EU)" },
  { value: "singapore", label: "Singapore (Asia)" },
];

const POSTGRES_VERSIONS = [
  { value: "16", label: "PostgreSQL 16" },
  { value: "15", label: "PostgreSQL 15" },
  { value: "14", label: "PostgreSQL 14" },
  { value: "13", label: "PostgreSQL 13" },
  { value: "12", label: "PostgreSQL 12" },
  { value: "11", label: "PostgreSQL 11" },
];

const PROVIDERS = [
  { value: "render_postgres", label: "Render PostgreSQL", enabled: true },
  { value: "supabase", label: "Supabase", enabled: false },
];

export function DatabaseDialog({
  open,
  onOpenChange,
  mode,
  database,
  projectId,
  shareToken,
  onSuccess,
}: DatabaseDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    provider: "render_postgres",
    plan: "starter",
    region: "oregon",
    postgresVersion: "16",
  });

  useEffect(() => {
    if (mode === "edit" && database) {
      setForm({
        name: database.name || "",
        provider: database.provider || "render_postgres",
        plan: database.plan || "starter",
        region: database.region || "oregon",
        postgresVersion: database.postgres_version || "16",
      });
    } else if (mode === "create") {
      setForm({
        name: "",
        provider: "render_postgres",
        plan: "starter",
        region: "oregon",
        postgresVersion: "16",
      });
    }
  }, [mode, database, open]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Database name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "create") {
        const { data, error } = await supabase.rpc("insert_database_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null,
          p_name: form.name,
          p_provider: form.provider as any,
          p_plan: form.plan as any,
          p_region: form.region,
          p_postgres_version: form.postgresVersion,
        });

        if (error) throw error;
        toast.success("Database configuration saved");
      } else if (mode === "edit" && database) {
        // Only allow plan updates for existing databases
        const { error } = await supabase.rpc("update_database_with_token", {
          p_database_id: database.id,
          p_token: shareToken || null,
          p_name: form.name,
          p_plan: form.plan as any,
        });

        if (error) throw error;

        // If plan changed and database exists on Render, sync the change
        if (database.render_postgres_id && form.plan !== database.plan) {
          const { error: renderError } = await supabase.functions.invoke("render-database", {
            body: {
              action: "update",
              databaseId: database.id,
              shareToken,
              plan: form.plan,
            },
          });

          if (renderError) {
            toast.warning("Saved locally, but failed to sync plan to Render");
          } else {
            toast.success("Database updated and synced to Render");
          }
        } else {
          toast.success("Database configuration updated");
        }
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save database");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEditable = mode === "create" || !database?.render_postgres_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {mode === "create" ? "Create Database" : "Edit Database"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Database Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="my-database"
              disabled={!isEditable && mode === "edit"}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={form.provider}
                onValueChange={(value) => setForm({ ...form, provider: value })}
                disabled={mode === "edit"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((provider) => (
                    <SelectItem
                      key={provider.value}
                      value={provider.value}
                      disabled={!provider.enabled}
                    >
                      {provider.label}
                      {!provider.enabled && " (Coming soon)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Plan</Label>
              <Select
                value={form.plan}
                onValueChange={(value) => setForm({ ...form, plan: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((plan) => (
                    <SelectItem
                      key={plan.value}
                      value={plan.value}
                      disabled={!plan.enabled}
                    >
                      {plan.label}
                      {!plan.enabled && " (Coming soon)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Region</Label>
              <Select
                value={form.region}
                onValueChange={(value) => setForm({ ...form, region: value })}
                disabled={mode === "edit" && database?.render_postgres_id}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((region) => (
                    <SelectItem key={region.value} value={region.value}>
                      {region.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>PostgreSQL Version</Label>
              <Select
                value={form.postgresVersion}
                onValueChange={(value) => setForm({ ...form, postgresVersion: value })}
                disabled={mode === "edit" && database?.render_postgres_id}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSTGRES_VERSIONS.map((version) => (
                    <SelectItem key={version.value} value={version.value}>
                      {version.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === "edit" && database?.render_postgres_id && (
            <p className="text-sm text-muted-foreground">
              Note: Region and PostgreSQL version cannot be changed after database creation.
              Only the plan can be updated.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : mode === "create" ? (
              "Create Database"
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
