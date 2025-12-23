import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface EditStandardDialogProps {
  open: boolean;
  onClose: () => void;
  standardId?: string;
  parentId?: string;
  categoryId?: string;
  onRefresh?: () => void;
}

export function EditStandardDialog({ open, onClose, standardId, parentId, categoryId, onRefresh }: EditStandardDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    title: "",
    description: "",
    long_description: "",
    content: "",
  });

  useEffect(() => {
    if (open) {
      if (standardId) loadStandard();
      else resetForm();
    }
  }, [open, standardId]);

  const loadStandard = async () => {
    if (!standardId) return;
    try {
      const { data, error } = await supabase.from("standards").select("*").eq("id", standardId).single();
      if (error) throw error;
      setFormData({
        code: data.code || "",
        title: data.title || "",
        description: data.description || "",
        long_description: data.long_description || "",
        content: data.content || "",
      });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const resetForm = () => {
    setFormData({ code: "", title: "", description: "", long_description: "", content: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.title) {
      toast.error("Code and Title are required");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("user_id", user?.id).single();

      const payload = {
        code: formData.code,
        title: formData.title,
        description: formData.description || null,
        long_description: formData.long_description || null,
        content: formData.content || null,
        org_id: profile?.org_id,
        created_by: user?.id,
        parent_id: parentId || null,
        category_id: categoryId,
      };

      if (standardId) {
        const { error } = await supabase.from("standards").update(payload).eq("id", standardId);
        if (error) throw error;
        toast.success("Standard updated");
      } else {
        const { error } = await supabase.from("standards").insert(payload);
        if (error) throw error;
        toast.success("Standard created");
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
          <DialogTitle>{standardId ? "Edit" : "Create"} Standard</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Code *</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g., SEC-001, PRIN-1"
                required
              />
            </div>
            <div>
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Standard title"
                required
              />
            </div>
          </div>

          <div>
            <Label>Short Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the standard"
              rows={2}
            />
          </div>

          <div>
            <Label>Long Description (KB Article / Documentation)</Label>
            <Textarea
              value={formData.long_description}
              onChange={(e) => setFormData({ ...formData, long_description: e.target.value })}
              placeholder="Paste in full documentation, KB articles, or detailed explanations here..."
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label>Content (Detailed Requirements)</Label>
            <Textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Specific requirements, rules, or criteria..."
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {standardId ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
