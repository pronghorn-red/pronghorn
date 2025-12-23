import { useState, useEffect } from "react";
import { 
  FileText, 
  Globe, 
  Youtube, 
  ImageIcon, 
  Plus, 
  Trash2, 
  Edit, 
  ExternalLink,
  Loader2,
  GripVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/contexts/AdminContext";

interface Resource {
  id: string;
  resource_type: "file" | "website" | "youtube" | "image";
  name: string;
  url: string;
  description?: string | null;
  thumbnail_url?: string | null;
  order_index?: number;
}

interface ResourceManagerProps {
  entityType: "standard" | "standard_category" | "tech_stack";
  entityId: string;
  onResourcesChange?: () => void;
}

const resourceTypeIcons = {
  file: FileText,
  website: Globe,
  youtube: Youtube,
  image: ImageIcon,
};

const resourceTypeLabels = {
  file: "File",
  website: "Website",
  youtube: "YouTube Video",
  image: "Image",
};

export function ResourceManager({ entityType, entityId, onResourcesChange }: ResourceManagerProps) {
  const { isAdmin } = useAdmin();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [formData, setFormData] = useState({
    resource_type: "website" as Resource["resource_type"],
    name: "",
    url: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const tableName = entityType === "tech_stack" ? "tech_stack_resources" : "standard_resources";
  const foreignKey = entityType === "tech_stack" 
    ? "tech_stack_id" 
    : entityType === "standard_category" 
      ? "standard_category_id" 
      : "standard_id";

  useEffect(() => {
    loadResources();
  }, [entityId, entityType]);

  const loadResources = async () => {
    setLoading(true);
    try {
      let query;
      if (entityType === "tech_stack") {
        const { data, error } = await supabase
          .from("tech_stack_resources")
          .select("*")
          .eq("tech_stack_id", entityId)
          .order("order_index", { ascending: true });
        if (error) throw error;
        setResources((data as Resource[]) || []);
      } else if (entityType === "standard_category") {
        const { data, error } = await supabase
          .from("standard_resources")
          .select("*")
          .eq("standard_category_id", entityId)
          .order("order_index", { ascending: true });
        if (error) throw error;
        setResources((data as Resource[]) || []);
      } else {
        const { data, error } = await supabase
          .from("standard_resources")
          .select("*")
          .eq("standard_id", entityId)
          .order("order_index", { ascending: true });
        if (error) throw error;
        setResources((data as Resource[]) || []);
      }
    } catch (error: any) {
      console.error("Error loading resources:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${entityType}-${entityId}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("standard-attachments")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("standard-attachments")
        .getPublicUrl(fileName);

      // Determine if it's an image
      const isImage = file.type.startsWith("image/");
      
      setFormData(prev => ({
        ...prev,
        resource_type: isImage ? "image" : "file",
        name: prev.name || file.name,
        url: publicUrl,
      }));

      toast.success("File uploaded");
    } catch (error: any) {
      toast.error("Failed to upload file: " + error.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast.error("Name and URL are required");
      return;
    }

    setSaving(true);
    try {
      const baseData = {
        resource_type: formData.resource_type,
        name: formData.name.trim(),
        url: formData.url.trim(),
        description: formData.description.trim() || null,
        order_index: editingResource?.order_index ?? resources.length,
      };

      if (editingResource) {
        if (entityType === "tech_stack") {
          const { error } = await supabase.from("tech_stack_resources").update({ ...baseData, tech_stack_id: entityId }).eq("id", editingResource.id);
          if (error) throw error;
        } else {
          const data = entityType === "standard_category" 
            ? { ...baseData, standard_category_id: entityId } 
            : { ...baseData, standard_id: entityId };
          const { error } = await supabase.from("standard_resources").update(data).eq("id", editingResource.id);
          if (error) throw error;
        }
        toast.success("Resource updated");
      } else {
        if (entityType === "tech_stack") {
          const { error } = await supabase.from("tech_stack_resources").insert({ ...baseData, tech_stack_id: entityId });
          if (error) throw error;
        } else {
          const data = entityType === "standard_category" 
            ? { ...baseData, standard_category_id: entityId } 
            : { ...baseData, standard_id: entityId };
          const { error } = await supabase.from("standard_resources").insert(data);
          if (error) throw error;
        }
        toast.success("Resource added");
      }

      setShowAddDialog(false);
      setEditingResource(null);
      resetForm();
      loadResources();
      onResourcesChange?.();
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this resource?")) return;

    try {
      if (entityType === "tech_stack") {
        const { error } = await supabase.from("tech_stack_resources").delete().eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("standard_resources").delete().eq("id", id);
        if (error) throw error;
      }
      toast.success("Resource deleted");
      loadResources();
      onResourcesChange?.();
    } catch (error: any) {
      toast.error("Failed to delete: " + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      resource_type: "website",
      name: "",
      url: "",
      description: "",
    });
  };

  const openEditDialog = (resource: Resource) => {
    setEditingResource(resource);
    setFormData({
      resource_type: resource.resource_type,
      name: resource.name,
      url: resource.url,
      description: resource.description || "",
    });
    setShowAddDialog(true);
  };

  const openAddDialog = (type?: Resource["resource_type"]) => {
    setEditingResource(null);
    resetForm();
    if (type) {
      setFormData(prev => ({ ...prev, resource_type: type }));
    }
    setShowAddDialog(true);
  };

  if (!isAdmin && resources.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Resource List */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading resources...
        </div>
      ) : resources.length > 0 ? (
        <div className="space-y-1">
          {resources.map((resource) => {
            const Icon = resourceTypeIcons[resource.resource_type];
            return (
              <div
                key={resource.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 group"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline truncate flex-1"
                >
                  {resource.name}
                </a>
                {isAdmin && (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => openEditDialog(resource)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => handleDelete(resource.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Add Resource Button */}
      {isAdmin && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <Plus className="h-3 w-3 mr-2" />
              Add Resource
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => openAddDialog("file")}>
              <FileText className="h-4 w-4 mr-2" />
              File
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openAddDialog("website")}>
              <Globe className="h-4 w-4 mr-2" />
              Website
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openAddDialog("youtube")}>
              <Youtube className="h-4 w-4 mr-2" />
              YouTube Video
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openAddDialog("image")}>
              <ImageIcon className="h-4 w-4 mr-2" />
              Image
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingResource ? "Edit Resource" : "Add Resource"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={formData.resource_type}
                onValueChange={(v: Resource["resource_type"]) =>
                  setFormData((prev) => ({ ...prev, resource_type: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="file">File</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="youtube">YouTube Video</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Resource name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">URL *</Label>
              <div className="flex gap-2">
                <Input
                  id="url"
                  value={formData.url}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, url: e.target.value }))
                  }
                  placeholder={
                    formData.resource_type === "youtube"
                      ? "https://youtube.com/watch?v=..."
                      : formData.resource_type === "website"
                      ? "https://example.com"
                      : "URL or upload a file"
                  }
                  className="flex-1"
                />
                {(formData.resource_type === "file" || formData.resource_type === "image") && (
                  <>
                    <input
                      type="file"
                      id="resource-file-upload"
                      className="hidden"
                      accept={formData.resource_type === "image" ? "image/*" : "*/*"}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById("resource-file-upload")?.click()}
                      disabled={uploadingFile}
                    >
                      {uploadingFile ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Upload"
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Optional description"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {editingResource ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
