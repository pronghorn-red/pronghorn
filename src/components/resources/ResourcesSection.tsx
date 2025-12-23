import { useState } from "react";
import { ExternalLink, Trash2, FileText, Globe, Youtube, Image, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/contexts/AdminContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface Resource {
  id: string;
  resource_type: "file" | "website" | "youtube" | "image";
  name: string;
  url: string;
  description?: string;
  thumbnail_url?: string;
  order_index: number;
}

interface ResourcesSectionProps {
  resources: Resource[];
  onRefresh: () => void;
  tableName: "standard_resources" | "tech_stack_resources";
}

const resourceTypeIcons = {
  file: FileText,
  website: Globe,
  youtube: Youtube,
  image: Image,
};

const resourceTypeColors = {
  file: "text-blue-500",
  website: "text-green-500",
  youtube: "text-red-500",
  image: "text-purple-500",
};

export function ResourcesSection({ resources, onRefresh, tableName }: ResourcesSectionProps) {
  const { isAdmin } = useAdmin();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenResource = (resource: Resource) => {
    window.open(resource.url, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq("id", deleteId);
      
      if (error) throw error;
      
      toast.success("Resource removed");
      onRefresh();
    } catch (error: any) {
      toast.error("Failed to remove resource: " + error.message);
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  if (resources.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-2">
        No resources attached
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        {resources.map((resource) => {
          const Icon = resourceTypeIcons[resource.resource_type];
          const colorClass = resourceTypeColors[resource.resource_type];
          
          return (
            <div
              key={resource.id}
              className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 group"
            >
              {isAdmin && (
                <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
              )}
              <Icon className={`h-4 w-4 ${colorClass} flex-shrink-0`} />
              <span className="text-sm truncate flex-1">{resource.name}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleOpenResource(resource)}
                  title="Open in new tab"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(resource.id)}
                    title="Remove resource"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Resource</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this resource? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
