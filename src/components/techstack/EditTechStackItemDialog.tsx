import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface EditTechStackItemDialogProps {
  open: boolean;
  onClose: () => void;
  itemId?: string;
  parentId?: string;
  onRefresh?: () => void;
}

const ITEM_TYPES = [
  "Language",
  "Framework",
  "Library",
  "Plugin",
  "IDE",
  "Tool",
  "Component",
  "Resource",
  "Website",
  "Other"
];

const VERSION_CONSTRAINTS = [
  { value: "^", label: "^  (Compatible)" },
  { value: "~", label: "~  (Patch only)" },
  { value: ">=", label: ">= (Or higher)" },
  { value: "=", label: "=  (Exact)" },
  { value: "latest", label: "latest" },
];

export function EditTechStackItemDialog({ open, onClose, itemId, parentId, onRefresh }: EditTechStackItemDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "Library",
    version: "",
    version_constraint: "^",
    description: "",
    long_description: "",
  });

  useEffect(() => {
    if (open) {
      if (itemId) loadItem();
      else resetForm();
    }
  }, [open, itemId]);

  const loadItem = async () => {
    if (!itemId) return;
    try {
      const { data, error } = await supabase.from("tech_stacks").select("*").eq("id", itemId).single();
      if (error) throw error;
      setFormData({
        name: data.name || "",
        type: data.type || "Library",
        version: data.version || "",
        version_constraint: data.version_constraint || "^",
        description: data.description || "",
        long_description: data.long_description || "",
      });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      type: "Library",
      version: "",
      version_constraint: "^",
      description: "",
      long_description: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("user_id", user?.id).single();

      const payload = {
        name: formData.name,
        type: formData.type,
        version: formData.version || null,
        version_constraint: formData.version_constraint || null,
        description: formData.description || null,
        long_description: formData.long_description || null,
        org_id: profile?.org_id,
        created_by: user?.id,
        parent_id: parentId || null,
      };

      if (itemId) {
        const { error } = await supabase.from("tech_stacks").update(payload).eq("id", itemId);
        if (error) throw error;
        toast.success("Item updated");
      } else {
        const { error } = await supabase.from("tech_stacks").insert(payload);
        if (error) throw error;
        toast.success("Item created");
      }

      onRefresh?.();
      onClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{itemId ? "Edit" : "Create"} Tech Stack Item</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., React, TypeScript"
                required
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {ITEM_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Version Constraint</Label>
              <Select value={formData.version_constraint} onValueChange={(v) => setFormData({ ...formData, version_constraint: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {VERSION_CONSTRAINTS.map(vc => (
                    <SelectItem key={vc.value} value={vc.value}>{vc.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Version</Label>
              <Input
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="e.g., 18.2.0"
              />
            </div>
          </div>

          <div>
            <Label>Short Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this item"
              rows={2}
            />
          </div>

          <div>
            <Label>Long Description (KB Article / Documentation)</Label>
            <Textarea
              value={formData.long_description}
              onChange={(e) => setFormData({ ...formData, long_description: e.target.value })}
              placeholder="Paste in full documentation, KB articles, usage guides, or detailed explanations here..."
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {itemId ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
