import { useState } from "react";
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

interface CreateFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "file" | "folder";
  basePath?: string;
  onConfirm: (name: string) => void;
}

export function CreateFileDialog({
  open,
  onOpenChange,
  type,
  basePath,
  onConfirm,
}: CreateFileDialogProps) {
  const [name, setName] = useState("");

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim());
      setName("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New {type === "file" ? "File" : "Folder"}</DialogTitle>
          <DialogDescription>
            {basePath ? `Creating in: ${basePath}` : "Creating in root directory"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{type === "file" ? "File" : "Folder"} Name</Label>
            <Input
              id="name"
              placeholder={type === "file" ? "example.ts" : "folder-name"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleConfirm();
                }
              }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
