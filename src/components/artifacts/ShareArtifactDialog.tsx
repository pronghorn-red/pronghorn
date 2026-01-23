import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Copy, ExternalLink, Globe, Check, Image, FileText, Code } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ShareArtifactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifact: {
    id: string;
    ai_title?: string | null;
    is_published?: boolean;
    image_url?: string | null;
    source_type?: string | null;
  };
  onUpdatePublished: (id: string, isPublished: boolean) => Promise<unknown>;
}

export function ShareArtifactDialog({
  open,
  onOpenChange,
  artifact,
  onUpdatePublished,
}: ShareArtifactDialogProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const baseUrl = "https://pronghorn.red";
  const viewerUrl = `${baseUrl}/viewer/${artifact.id}`;
  const rawUrl = `${baseUrl}/viewer/${artifact.id}/raw`;
  const binaryUrl = `${baseUrl}/viewer/${artifact.id}/binary`;

  // Determine if binary URL should be shown (for images or binary content)
  const isBinaryContent = !!artifact.image_url || 
    artifact.source_type === "image" || 
    artifact.source_type?.startsWith("image/");

  const handleTogglePublished = async (checked: boolean) => {
    setIsUpdating(true);
    try {
      await onUpdatePublished(artifact.id, checked);
    } catch (error) {
      // Error handled in parent
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyUrl = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.success(`${label} URL copied to clipboard`);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (error) {
      toast.error("Failed to copy URL");
    }
  };

  const handleOpenUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const urlItems = [
    {
      label: "Viewer",
      description: "Rich viewer with markdown/HTML preview",
      url: viewerUrl,
      icon: FileText,
      show: true,
    },
    {
      label: "Raw",
      description: "Plain text content",
      url: rawUrl,
      icon: Code,
      show: true,
    },
    {
      label: "Binary",
      description: "Direct image/file access",
      url: binaryUrl,
      icon: Image,
      show: isBinaryContent,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Share Artifact
          </DialogTitle>
          <DialogDescription className="line-clamp-1">
            {artifact.ai_title || "Untitled Artifact"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Publish Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="publish-toggle" className="text-base font-medium">
                Publish publicly
              </Label>
              <p className="text-sm text-muted-foreground">
                {artifact.is_published 
                  ? "This artifact is publicly accessible" 
                  : "Make this artifact accessible via URL"}
              </p>
            </div>
            <Switch
              id="publish-toggle"
              checked={artifact.is_published || false}
              onCheckedChange={handleTogglePublished}
              disabled={isUpdating}
            />
          </div>

          {/* URL List */}
          <div className={cn(
            "space-y-3 transition-opacity",
            !artifact.is_published && "opacity-50 pointer-events-none"
          )}>
            <Label className="text-sm font-medium text-muted-foreground">
              Public URLs
            </Label>
            
            {urlItems.filter(item => item.show).map((item) => (
              <div 
                key={item.label}
                className="space-y-2"
              >
                <div className="flex items-center gap-2 text-sm">
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground hidden sm:inline">
                    — {item.description}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={item.url}
                    readOnly
                    className="font-mono text-xs h-9"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => handleCopyUrl(item.url, item.label)}
                    disabled={!artifact.is_published}
                  >
                    {copiedUrl === item.url ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => handleOpenUrl(item.url)}
                    disabled={!artifact.is_published}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {!artifact.is_published && (
            <p className="text-sm text-muted-foreground text-center">
              Enable publishing to access public URLs
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
