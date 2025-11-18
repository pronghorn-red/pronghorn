import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface AnonymousProjectWarningProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  shareToken: string;
}

export function AnonymousProjectWarning({
  open,
  onClose,
  projectId,
  shareToken,
}: AnonymousProjectWarningProps) {
  const shareUrl = `${window.location.origin}/project/${projectId}/canvas?token=${shareToken}`;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Save This Link!
          </DialogTitle>
          <DialogDescription>
            You created a project without signing in. Save this link to access your project later.
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-warning/10 border-warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> If you lose this link, you won't be able to recover your project.
            Consider signing up to save your projects permanently.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label>Project Share Link</Label>
          <div className="flex gap-2">
            <Input value={shareUrl} readOnly className="font-mono text-sm" />
            <Button onClick={handleCopy} variant="outline" size="icon">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Anyone with this link can view and edit this project
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            I've Saved the Link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
