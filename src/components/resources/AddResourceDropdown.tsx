import { useState } from "react";
import { Plus, FileUp, Globe, Youtube, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ResourceType = "file" | "website" | "youtube" | "image";

interface AddResourceDropdownProps {
  parentId: string;
  parentType: "standard" | "standard_category" | "tech_stack";
  onResourceAdded: () => void;
}

export function AddResourceDropdown({ parentId, parentType, onResourceAdded }: AddResourceDropdownProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resourceType, setResourceType] = useState<ResourceType>("website");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const handleOpenDialog = (type: ResourceType) => {
    setResourceType(type);
    setName("");
    setUrl("");
    setDescription("");
    setDialogOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSubmitting(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `resources/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      await insertResource("file", file.name, publicUrl);
      
      toast.success("File uploaded successfully");
      onResourceAdded();
    } catch (error: any) {
      toast.error("Failed to upload file: " + error.message);
    } finally {
      setIsSubmitting(false);
      setFileInputKey(prev => prev + 1);
    }
  };

  const insertResource = async (type: ResourceType, resourceName: string, resourceUrl: string, desc?: string) => {
    const tableName = parentType === "tech_stack" ? "tech_stack_resources" : "standard_resources";
    
    const insertData: any = {
      resource_type: type,
      name: resourceName,
      url: resourceUrl,
      description: desc || null,
    };

    if (parentType === "standard") {
      insertData.standard_id = parentId;
    } else if (parentType === "standard_category") {
      insertData.standard_category_id = parentId;
    } else if (parentType === "tech_stack") {
      insertData.tech_stack_id = parentId;
    }

    const { error } = await supabase.from(tableName).insert(insertData);
    if (error) throw error;
  };

  const handleSubmit = async () => {
    if (!name.trim() || !url.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      // Auto-extract YouTube thumbnail if applicable
      let thumbnailUrl: string | undefined;
      if (resourceType === "youtube") {
        const videoId = extractYouTubeVideoId(url);
        if (videoId) {
          thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
      }

      await insertResource(resourceType, name.trim(), url.trim(), description.trim());
      
      toast.success("Resource added successfully");
      setDialogOpen(false);
      onResourceAdded();
    } catch (error: any) {
      toast.error("Failed to add resource: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const extractYouTubeVideoId = (youtubeUrl: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    ];
    for (const pattern of patterns) {
      const match = youtubeUrl.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const getDialogTitle = () => {
    switch (resourceType) {
      case "website": return "Add Website Link";
      case "youtube": return "Add YouTube Video";
      case "image": return "Add Image URL";
      default: return "Add Resource";
    }
  };

  const getUrlPlaceholder = () => {
    switch (resourceType) {
      case "website": return "https://example.com";
      case "youtube": return "https://youtube.com/watch?v=...";
      case "image": return "https://example.com/image.jpg";
      default: return "https://...";
    }
  };

  return (
    <>
      <input
        key={fileInputKey}
        type="file"
        id={`file-upload-${parentId}`}
        className="hidden"
        onChange={handleFileUpload}
        disabled={isSubmitting}
      />
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            Add Resource
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem 
            onClick={() => document.getElementById(`file-upload-${parentId}`)?.click()}
            disabled={isSubmitting}
          >
            <FileUp className="h-4 w-4 mr-2 text-blue-500" />
            Upload File
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleOpenDialog("website")}>
            <Globe className="h-4 w-4 mr-2 text-green-500" />
            Add Website Link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleOpenDialog("youtube")}>
            <Youtube className="h-4 w-4 mr-2 text-red-500" />
            Add YouTube Video
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleOpenDialog("image")}>
            <Image className="h-4 w-4 mr-2 text-purple-500" />
            Add Image URL
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="resource-name">Name *</Label>
              <Input
                id="resource-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Resource name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resource-url">URL *</Label>
              <Input
                id="resource-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={getUrlPlaceholder()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resource-description">Description (optional)</Label>
              <Textarea
                id="resource-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this resource"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Resource"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
