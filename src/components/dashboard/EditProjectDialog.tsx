import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EditProjectDialogProps {
  projectId: string;
  currentName: string;
  currentDescription?: string | null;
  currentOrganization?: string | null;
  currentBudget?: number | null;
  currentScope?: string | null;
  onUpdate?: () => void;
}

export function EditProjectDialog({
  projectId,
  currentName,
  currentDescription,
  currentOrganization,
  currentBudget,
  currentScope,
  onUpdate
}: EditProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [description, setDescription] = useState(currentDescription || "");
  const [organization, setOrganization] = useState(currentOrganization || "");
  const [budget, setBudget] = useState(currentBudget?.toString() || "");
  const [scope, setScope] = useState(currentScope || "");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setDescription(currentDescription || "");
      setOrganization(currentOrganization || "");
      setBudget(currentBudget?.toString() || "");
      setScope(currentScope || "");
    }
  }, [open, currentName, currentDescription, currentOrganization, currentBudget, currentScope]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }

    setIsUpdating(true);

    try {
      const { error } = await supabase
        .from('projects')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          organization: organization.trim() || null,
          budget: budget ? parseFloat(budget) : null,
          scope: scope.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);

      if (error) throw error;

      toast.success("Project updated successfully!");
      setOpen(false);
      onUpdate?.();
    } catch (error) {
      console.error("Error updating project:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update project");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update project metadata and details
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Project Name *</Label>
            <Input
              id="edit-name"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              placeholder="Brief description of your project..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-organization">Organization</Label>
            <Input
              id="edit-organization"
              placeholder="Your organization name"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-budget">Budget</Label>
              <Input
                id="edit-budget"
                type="number"
                placeholder="Project budget"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-scope">Scope</Label>
              <Input
                id="edit-scope"
                placeholder="Project scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              />
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isUpdating}>
            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
