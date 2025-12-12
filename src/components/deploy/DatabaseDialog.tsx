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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Database, Plus, Trash2, Settings, Shield } from "lucide-react";
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
  { value: "free", label: "Free", enabled: false },
  { value: "basic_256mb", label: "Basic 256MB", enabled: true },
  { value: "basic_1gb", label: "Basic 1GB", enabled: true },
  { value: "basic_4gb", label: "Basic 4GB", enabled: false },
  { value: "pro_4gb", label: "Pro 4GB", enabled: false },
  { value: "pro_8gb", label: "Pro 8GB", enabled: false },
  { value: "pro_16gb", label: "Pro 16GB", enabled: false },
  { value: "pro_32gb", label: "Pro 32GB", enabled: false },
  { value: "pro_64gb", label: "Pro 64GB", enabled: false },
  { value: "pro_128gb", label: "Pro 128GB", enabled: false },
  { value: "pro_192gb", label: "Pro 192GB", enabled: false },
  { value: "pro_256gb", label: "Pro 256GB", enabled: false },
  { value: "pro_384gb", label: "Pro 384GB", enabled: false },
  { value: "pro_512gb", label: "Pro 512GB", enabled: false },
  { value: "accelerated_16gb", label: "Accelerated 16GB", enabled: false },
  { value: "accelerated_32gb", label: "Accelerated 32GB", enabled: false },
  { value: "accelerated_64gb", label: "Accelerated 64GB", enabled: false },
  { value: "accelerated_128gb", label: "Accelerated 128GB", enabled: false },
  { value: "accelerated_256gb", label: "Accelerated 256GB", enabled: false },
  { value: "accelerated_384gb", label: "Accelerated 384GB", enabled: false },
  { value: "accelerated_512gb", label: "Accelerated 512GB", enabled: false },
  { value: "accelerated_768gb", label: "Accelerated 768GB", enabled: false },
  { value: "accelerated_1024gb", label: "Accelerated 1024GB", enabled: false },
];

const REGIONS = [
  { value: "oregon", label: "Oregon (US West)" },
  { value: "ohio", label: "Ohio (US East)" },
  { value: "virginia", label: "Virginia (US East)" },
  { value: "frankfurt", label: "Frankfurt (EU)" },
  { value: "singapore", label: "Singapore (Asia)" },
];

const POSTGRES_VERSIONS = [
  { value: "18", label: "PostgreSQL 18" },
  { value: "17", label: "PostgreSQL 17" },
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

interface IpAllowEntry {
  cidrBlock: string;
  description: string;
}

export function DatabaseDialog({
  open,
  onOpenChange,
  mode,
  database,
  projectId,
  shareToken,
  onSuccess,
  primeRepoName = "",
}: DatabaseDialogProps & { primeRepoName?: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("configuration");
  
  // Generate a random 4-character alphanumeric ID
  const generateUniqueId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };
  
  const generateDatabaseName = (repoName: string) => {
    const baseName = repoName || 'database';
    return `${baseName}-database-${generateUniqueId()}`;
  };
  
  const [form, setForm] = useState({
    name: generateDatabaseName(primeRepoName),
    provider: "render_postgres",
    plan: "basic_256mb",
    region: "oregon",
    postgresVersion: "16",
    databaseUser: "",
    databaseInternalName: "",
    autoGenerateUser: true,
    autoGenerateName: true,
  });
  const [ipAllowList, setIpAllowList] = useState<IpAllowEntry[]>([]);
  const [allowAnyIp, setAllowAnyIp] = useState(false);

  useEffect(() => {
    if (mode === "edit" && database) {
      const existingIpList = database.ip_allow_list || [];
      const hasInternet = existingIpList.some((ip: IpAllowEntry) => ip.cidrBlock === "0.0.0.0/0");
      
      setForm({
        name: database.name || "",
        provider: database.provider || "render_postgres",
        plan: database.plan || "basic_256mb",
        region: database.region || "oregon",
        postgresVersion: database.postgres_version || "16",
        databaseUser: database.database_user || "",
        databaseInternalName: database.database_internal_name || "",
        autoGenerateUser: !database.database_user,
        autoGenerateName: !database.database_internal_name,
      });
      setIpAllowList(existingIpList.filter((ip: IpAllowEntry) => ip.cidrBlock !== "0.0.0.0/0"));
      setAllowAnyIp(hasInternet);
    } else if (mode === "create") {
      setForm({
        name: generateDatabaseName(primeRepoName),
        provider: "render_postgres",
        plan: "basic_256mb",
        region: "oregon",
        postgresVersion: "16",
        databaseUser: "",
        databaseInternalName: "",
        autoGenerateUser: true,
        autoGenerateName: true,
      });
      setIpAllowList([]);
      setAllowAnyIp(false);
    }
    setActiveTab("configuration");
  }, [mode, database, open]);

  const handleAddIpEntry = () => {
    setIpAllowList([...ipAllowList, { cidrBlock: "", description: "" }]);
  };

  const handleRemoveIpEntry = (index: number) => {
    setIpAllowList(ipAllowList.filter((_, i) => i !== index));
  };

  const handleUpdateIpEntry = (index: number, field: keyof IpAllowEntry, value: string) => {
    const updated = [...ipAllowList];
    updated[index] = { ...updated[index], [field]: value };
    setIpAllowList(updated);
  };

  const buildIpAllowList = (): IpAllowEntry[] => {
    const list: IpAllowEntry[] = [];
    
    if (allowAnyIp) {
      list.push({ cidrBlock: "0.0.0.0/0", description: "Internet" });
    }
    
    // Add custom entries (filter out empty ones)
    ipAllowList.forEach(entry => {
      if (entry.cidrBlock.trim()) {
        list.push({
          cidrBlock: entry.cidrBlock.trim(),
          description: entry.description.trim() || "Custom",
        });
      }
    });
    
    return list;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const finalIpAllowList = buildIpAllowList();

      if (mode === "create") {
        const { data, error } = await supabase.rpc("insert_database_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null,
          p_name: form.name,
          p_provider: form.provider as any,
          p_plan: form.plan as any,
          p_region: form.region,
          p_postgres_version: form.postgresVersion,
          p_database_user: form.autoGenerateUser ? null : form.databaseUser || null,
          p_database_internal_name: form.autoGenerateName ? null : form.databaseInternalName || null,
          p_ip_allow_list: finalIpAllowList as any,
        });

        if (error) throw error;
        toast.success("Database configuration saved");
      } else if (mode === "edit" && database) {
        const { error } = await supabase.rpc("update_database_with_token", {
          p_database_id: database.id,
          p_token: shareToken || null,
          p_name: form.name,
          p_plan: form.plan as any,
          p_ip_allow_list: finalIpAllowList as any,
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
      <DialogContent className="w-[90vw] h-[90vh] max-w-none flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {mode === "create" ? "Create Database" : "Edit Database"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 w-fit flex-shrink-0">
            <TabsTrigger value="configuration" className="flex items-center gap-1.5">
              <Settings className="h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="ip-allow-list" className="flex items-center gap-1.5">
              <Shield className="h-4 w-4" />
              IP Allow List
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto px-6 py-4">
            <TabsContent value="configuration" className="mt-0 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Database Name (Display)</Label>
                    <Input
                      id="name"
                      value={form.name}
                      readOnly
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">Auto-generated from repository name</p>
                  </div>

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
                      <SelectContent className="max-h-64">
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

                {/* Right Column */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="databaseUser">Database User</Label>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="autoGenerateUser"
                          checked={form.autoGenerateUser}
                          onCheckedChange={(checked) => setForm({ ...form, autoGenerateUser: !!checked })}
                          disabled={mode === "edit" && database?.render_postgres_id}
                        />
                        <Label htmlFor="autoGenerateUser" className="text-xs text-muted-foreground cursor-pointer">
                          Auto-generate
                        </Label>
                      </div>
                    </div>
                    <Input
                      id="databaseUser"
                      value={form.databaseUser}
                      onChange={(e) => setForm({ ...form, databaseUser: e.target.value })}
                      placeholder={form.autoGenerateUser ? "Auto-generated by Render" : "my_db_user"}
                      disabled={form.autoGenerateUser || (mode === "edit" && database?.render_postgres_id)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="databaseInternalName">Database Name (Internal)</Label>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="autoGenerateName"
                          checked={form.autoGenerateName}
                          onCheckedChange={(checked) => setForm({ ...form, autoGenerateName: !!checked })}
                          disabled={mode === "edit" && database?.render_postgres_id}
                        />
                        <Label htmlFor="autoGenerateName" className="text-xs text-muted-foreground cursor-pointer">
                          Auto-generate
                        </Label>
                      </div>
                    </div>
                    <Input
                      id="databaseInternalName"
                      value={form.databaseInternalName}
                      onChange={(e) => setForm({ ...form, databaseInternalName: e.target.value })}
                      placeholder={form.autoGenerateName ? "Auto-generated by Render" : "my_database"}
                      disabled={form.autoGenerateName || (mode === "edit" && database?.render_postgres_id)}
                    />
                    <p className="text-xs text-muted-foreground">PostgreSQL database name (used in connection string)</p>
                  </div>

                  {mode === "edit" && database?.render_postgres_id && (
                    <div className="rounded-md bg-muted p-3 mt-4">
                      <p className="text-sm text-muted-foreground">
                        <strong>Note:</strong> Region, PostgreSQL version, database user, and internal name cannot be changed after database creation. Only the plan and IP allow list can be updated.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ip-allow-list" className="mt-0 space-y-4">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
                  <Checkbox
                    id="allowAnyIp"
                    checked={allowAnyIp}
                    onCheckedChange={(checked) => setAllowAnyIp(!!checked)}
                  />
                  <div>
                    <Label htmlFor="allowAnyIp" className="cursor-pointer font-medium">
                      Allow Any IP (0.0.0.0/0)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Allow connections from any IP address. Use for development only.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Custom IP Addresses</Label>
                    <Button variant="outline" size="sm" onClick={handleAddIpEntry}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add IP
                    </Button>
                  </div>

                  {ipAllowList.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg">
                      <Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No custom IP addresses configured</p>
                      <p className="text-xs mt-1">Add specific CIDR blocks to allow connections</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {ipAllowList.map((entry, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={entry.cidrBlock}
                            onChange={(e) => handleUpdateIpEntry(index, "cidrBlock", e.target.value)}
                            placeholder="10.0.0.0/8"
                            className="flex-1"
                          />
                          <Input
                            value={entry.description}
                            onChange={(e) => handleUpdateIpEntry(index, "description", e.target.value)}
                            placeholder="Description"
                            className="flex-1"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveIpEntry(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Enter CIDR blocks in format: 10.0.0.0/8 or single IPs: 192.168.1.1/32
                  </p>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
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
