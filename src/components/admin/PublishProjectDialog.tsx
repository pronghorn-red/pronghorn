import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Upload, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PublishProjectDialogProps {
  projectId: string;
  projectName: string;
  projectDescription?: string | null;
  projectTags?: string[] | null;
  splashImageUrl?: string | null;
  onPublished?: () => void;
}

const CATEGORIES = [
  { value: "template", label: "Template" },
  { value: "starter", label: "Starter Project" },
  { value: "demo", label: "Demo" },
  { value: "tutorial", label: "Tutorial" },
  { value: "other", label: "Other" },
];

export function PublishProjectDialog({
  projectId,
  projectName,
  projectDescription,
  projectTags,
  splashImageUrl,
  onPublished,
}: PublishProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [name, setName] = useState(projectName);
  const [description, setDescription] = useState(projectDescription || "");
  const [tags, setTags] = useState(projectTags?.join(", ") || "");
  const [category, setCategory] = useState("template");
  const [imageUrl, setImageUrl] = useState(splashImageUrl || "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `gallery/${projectId}/cover-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("project-images")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("project-images")
        .getPublicUrl(fileName);

      setImageUrl(urlData.publicUrl);
      toast.success("Image uploaded");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePublish = async () => {
    if (!name.trim()) {
      toast.error("Please enter a project name");
      return;
    }

    setIsPublishing(true);

    try {
      const tagsArray = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { error } = await supabase.rpc("publish_project_to_gallery", {
        p_project_id: projectId,
        p_name: name,
        p_description: description || null,
        p_image_url: imageUrl || null,
        p_tags: tagsArray.length > 0 ? tagsArray : null,
        p_category: category,
      });

      if (error) throw error;

      toast.success("Project published to gallery!");
      setOpen(false);
      onPublished?.();
    } catch (error) {
      console.error("Publish error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to publish");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Globe className="mr-2 h-4 w-4" />
          Publish
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Publish to Gallery
          </DialogTitle>
          <DialogDescription>
            Make this project available in the public gallery for others to
            discover and clone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Cover Image */}
          <div className="space-y-2">
            <Label>Cover Image</Label>
            {imageUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img
                  src={imageUrl}
                  alt="Cover"
                  className="w-full h-32 object-cover"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6"
                  onClick={() => setImageUrl("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Cover Image
                    </>
                  )}
                </Button>
              </>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="pub-name">Name</Label>
            <Input
              id="pub-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name in gallery"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="pub-description">Description</Label>
            <Textarea
              id="pub-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description for the gallery..."
              rows={3}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="pub-tags">Tags</Label>
            <Input
              id="pub-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="react, template, starter"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated tags for discoverability
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={isPublishing}>
            {isPublishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Globe className="mr-2 h-4 w-4" />
                Publish
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
