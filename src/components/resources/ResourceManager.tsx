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
  Play,
  Github,
  Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
  resource_type: "file" | "website" | "youtube" | "image" | "repo" | "library";
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
  repo: Github,
  library: Package,
};

const resourceTypeLabels = {
  file: "File",
  website: "Website",
  youtube: "YouTube Video",
  image: "Image",
  repo: "Repository",
  library: "Library",
};

const resourceTypeColors = {
  file: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  website: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  youtube: "bg-red-500/10 text-red-600 border-red-500/20",
  image: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  repo: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  library: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

const resourceTypePlaceholders = {
  file: "URL or upload a file",
  website: "https://example.com",
  youtube: "https://youtube.com/watch?v=...",
  image: "URL or upload an image",
  repo: "https://github.com/owner/repo",
  library: "https://www.npmjs.com/package/... or package name",
};

// Extract YouTube video ID from URL
const getYouTubeVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// Detect library type from URL
const getLibraryType = (url: string): string | null => {
  if (url.includes("npmjs.com") || url.includes("npm")) return "npm";
  if (url.includes("maven") || url.includes("mvnrepository")) return "maven";
  if (url.includes("pypi.org") || url.includes("anaconda")) return "python";
  if (url.includes("nuget.org")) return "nuget";
  if (url.includes("crates.io")) return "cargo";
  if (url.includes("packagist.org")) return "composer";
  return null;
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

  useEffect(() => {
    loadResources();
  }, [entityId, entityType]);

  const loadResources = async () => {
    setLoading(true);
    try {
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
      // Cast resource_type to any to support new enum values (repo, library) before types regenerate
      const baseData = {
        resource_type: formData.resource_type as any,
        name: formData.name.trim(),
        url: formData.url.trim(),
        description: formData.description.trim() || null,
        order_index: editingResource?.order_index ?? resources.length,
      };

      if (editingResource) {
        if (entityType === "tech_stack") {
          const { error } = await supabase.from("tech_stack_resources").update({ ...baseData, tech_stack_id: entityId } as any).eq("id", editingResource.id);
          if (error) throw error;
        } else {
          const data = entityType === "standard_category" 
            ? { ...baseData, standard_category_id: entityId } 
            : { ...baseData, standard_id: entityId };
          const { error } = await supabase.from("standard_resources").update(data as any).eq("id", editingResource.id);
          if (error) throw error;
        }
        toast.success("Resource updated");
      } else {
        if (entityType === "tech_stack") {
          const { error } = await supabase.from("tech_stack_resources").insert({ ...baseData, tech_stack_id: entityId } as any);
          if (error) throw error;
        } else {
          const data = entityType === "standard_category" 
            ? { ...baseData, standard_category_id: entityId } 
            : { ...baseData, standard_id: entityId };
          const { error } = await supabase.from("standard_resources").insert(data as any);
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
    <div className="space-y-3">
      {/* Resource Cards */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading resources...
        </div>
      ) : resources.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {resources.map((resource) => {
            const Icon = resourceTypeIcons[resource.resource_type] || Globe;
            const colorClass = resourceTypeColors[resource.resource_type] || resourceTypeColors.website;
            const videoId = resource.resource_type === "youtube" ? getYouTubeVideoId(resource.url) : null;
            const libraryType = resource.resource_type === "library" ? getLibraryType(resource.url) : null;
            
            return (
              <Card 
                key={resource.id} 
                className="group overflow-hidden hover:shadow-md transition-all duration-200 border-border/60"
              >
                {/* Thumbnail/Preview Area */}
                {resource.resource_type === "youtube" && videoId ? (
                  <div className="relative aspect-video bg-muted">
                    <img 
                      src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                      alt={resource.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
                        <Play className="h-5 w-5 text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                  </div>
                ) : resource.resource_type === "image" ? (
                  <div className="aspect-video bg-muted">
                    <img 
                      src={resource.url}
                      alt={resource.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className={`h-20 flex items-center justify-center ${colorClass} border-b`}>
                    <Icon className="h-8 w-8" />
                  </div>
                )}
                
                <CardContent className="p-3 space-y-2">
                  {/* Type Badge & Name */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colorClass}`}>
                      {resourceTypeLabels[resource.resource_type] || resource.resource_type}
                    </span>
                    {libraryType && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {libraryType}
                      </span>
                    )}
                  </div>
                  
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sm hover:text-primary transition-colors line-clamp-2 block"
                  >
                    {resource.name}
                  </a>
                  
                  {/* Description */}
                  {resource.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {resource.description}
                    </p>
                  )}
                  
                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </a>
                    
                    {isAdmin && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(resource)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(resource.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
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
            <DropdownMenuItem onClick={() => openAddDialog("repo")}>
              <Github className="h-4 w-4 mr-2" />
              Repository (GitHub)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openAddDialog("library")}>
              <Package className="h-4 w-4 mr-2" />
              Library (npm, maven, etc.)
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
                  <SelectItem value="repo">Repository (GitHub)</SelectItem>
                  <SelectItem value="library">Library (npm, maven, etc.)</SelectItem>
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
                  placeholder={resourceTypePlaceholders[formData.resource_type] || "URL"}
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
              {formData.resource_type === "library" && (
                <p className="text-xs text-muted-foreground">
                  Supports npm, maven, pypi, nuget, cargo, and composer package URLs
                </p>
              )}
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
