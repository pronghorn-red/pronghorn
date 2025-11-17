import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Loader2 } from "lucide-react";

interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_system: boolean;
}

export function ManageCategoriesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", icon: "", color: "#3b82f6" });

  useEffect(() => {
    if (open) loadCategories();
  }, [open]);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase.from("standard_categories").select("*").order("order_index");
      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("user_id", user?.id).single();

      if (editingId) {
        const { error } = await supabase.from("standard_categories").update(formData).eq("id", editingId);
        if (error) throw error;
        toast.success("Category updated");
      } else {
        const { error } = await supabase.from("standard_categories").insert({ ...formData, org_id: profile?.org_id, created_by: user?.id });
        if (error) throw error;
        toast.success("Category created");
      }

      setFormData({ name: "", description: "", icon: "", color: "#3b82f6" });
      setEditingId(null);
      loadCategories();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    try {
      const { error } = await supabase.from("standard_categories").delete().eq("id", id);
      if (error) throw error;
      toast.success("Category deleted");
      loadCategories();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleEdit = (cat: Category) => {
    setEditingId(cat.id);
    setFormData({ name: cat.name, description: cat.description || "", icon: cat.icon || "", color: cat.color || "#3b82f6" });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Standard Categories</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 border-b pb-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Name *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div>
            <div><Label>Icon (emoji)</Label><Input value={formData.icon} onChange={(e) => setFormData({ ...formData, icon: e.target.value })} placeholder="🔒" /></div>
          </div>
          <div><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} /></div>
          <div><Label>Color</Label><Input type="color" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} /></div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>{loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingId ? "Update" : "Create"}</Button>
            {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setFormData({ name: "", description: "", icon: "", color: "#3b82f6" }); }}>Cancel</Button>}
          </div>
        </form>

        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                {cat.icon && <span className="text-2xl">{cat.icon}</span>}
                <div><div className="font-medium">{cat.name}</div>{cat.description && <div className="text-sm text-muted-foreground">{cat.description}</div>}</div>
                {cat.is_system && <Badge variant="outline">System</Badge>}
              </div>
              {!cat.is_system && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(cat)}><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(cat.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
