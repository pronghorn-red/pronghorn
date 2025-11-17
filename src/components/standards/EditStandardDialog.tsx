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

interface EditStandardDialogProps {
  open: boolean;
  onClose: () => void;
  standardId?: string;
  parentId?: string;
  categoryId?: string;
}

export function EditStandardDialog({ open, onClose, standardId, parentId, categoryId }: EditStandardDialogProps) {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    code: "",
    title: "",
    description: "",
    content: "",
    category_id: categoryId || "",
  });

  useEffect(() => {
    if (open) {
      loadCategories();
      if (standardId) loadStandard();
      else resetForm();
    }
  }, [open, standardId]);

  const loadCategories = async () => {
    const { data } = await supabase.from("standard_categories").select("*").order("name");
    setCategories(data || []);
  };

  const loadStandard = async () => {
    if (!standardId) return;
    try {
      const { data, error } = await supabase.from("standards").select("*").eq("id", standardId).single();
      if (error) throw error;
      setFormData({ code: data.code, title: data.title, description: data.description || "", content: data.content || "", category_id: data.category_id });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const resetForm = () => {
    setFormData({ code: "", title: "", description: "", content: "", category_id: categoryId || "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.title || !formData.category_id) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("user_id", user?.id).single();

      const payload = { ...formData, org_id: profile?.org_id, created_by: user?.id, parent_id: parentId || null };

      if (standardId) {
        const { error } = await supabase.from("standards").update(payload).eq("id", standardId);
        if (error) throw error;
        toast.success("Standard updated");
      } else {
        const { error } = await supabase.from("standards").insert(payload);
        if (error) throw error;
        toast.success("Standard created");
      }

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
            <div><Label>Code *</Label><Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="SEC-001" required /></div>
            <div><Label>Category *</Label><Select value={formData.category_id} onValueChange={(v) => setFormData({ ...formData, category_id: v })} required><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label>Title *</Label><Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required /></div>
          <div><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
          <div><Label>Content (detailed requirements)</Label><Textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} rows={8} className="font-mono text-sm" /></div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{standardId ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
