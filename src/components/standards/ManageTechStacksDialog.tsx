import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Edit2, Loader2, Link } from "lucide-react";
import { StandardsTree } from "./StandardsTree";

interface TechStack {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export function ManageTechStacksDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stacks, setStacks] = useState<TechStack[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkingStackId, setLinkingStackId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", icon: "", color: "#3b82f6" });

  useEffect(() => {
    if (open) loadStacks();
  }, [open]);

  const loadStacks = async () => {
    try {
      const { data, error } = await supabase.from("tech_stacks").select("*").order("name");
      if (error) throw error;
      setStacks(data || []);
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
        const { error } = await supabase.from("tech_stacks").update(formData).eq("id", editingId);
        if (error) throw error;
        toast.success("Tech stack updated");
      } else {
        const { error } = await supabase.from("tech_stacks").insert({ ...formData, org_id: profile?.org_id, created_by: user?.id });
        if (error) throw error;
        toast.success("Tech stack created");
      }

      setFormData({ name: "", description: "", icon: "", color: "#3b82f6" });
      setEditingId(null);
      loadStacks();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tech stack?")) return;
    try {
      const { error } = await supabase.from("tech_stacks").delete().eq("id", id);
      if (error) throw error;
      toast.success("Tech stack deleted");
      loadStacks();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleEdit = (stack: TechStack) => {
    setEditingId(stack.id);
    setFormData({ name: stack.name, description: stack.description || "", icon: stack.icon || "", color: stack.color || "#3b82f6" });
  };

  const handleLinkStandard = async (stackId: string, standardId: string) => {
    try {
      const { error } = await supabase.from("tech_stack_standards").insert({ tech_stack_id: stackId, standard_id: standardId });
      if (error) {
        if (error.code === "23505") toast.info("Already linked");
        else throw error;
      } else toast.success("Standard linked");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Tech Stacks</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 border-b pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Vue/Node SPA" required /></div>
              <div><Label>Icon (emoji)</Label><Input value={formData.icon} onChange={(e) => setFormData({ ...formData, icon: e.target.value })} placeholder="⚡" /></div>
            </div>
            <div><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} /></div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>{loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingId ? "Update" : "Create"}</Button>
              {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setFormData({ name: "", description: "", icon: "", color: "#3b82f6" }); }}>Cancel</Button>}
            </div>
          </form>

          <div className="space-y-2">
            {stacks.map((stack) => (
              <div key={stack.id} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {stack.icon && <span className="text-2xl">{stack.icon}</span>}
                    <div><div className="font-medium">{stack.name}</div>{stack.description && <div className="text-sm text-muted-foreground">{stack.description}</div>}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setLinkingStackId(stack.id)}><Link className="h-4 w-4 mr-1" />Link Standards</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(stack)}><Edit2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(stack.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {linkingStackId && (
        <Dialog open={!!linkingStackId} onOpenChange={() => setLinkingStackId(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh]">
            <DialogHeader><DialogTitle>Link Standards to Tech Stack</DialogTitle></DialogHeader>
            <LinkStandardsToStack stackId={linkingStackId} onLink={(sid) => handleLinkStandard(linkingStackId, sid)} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function LinkStandardsToStack({ stackId, onLink }: { stackId: string; onLink: (standardId: string) => void }) {
  const [standards, setStandards] = useState<any[]>([]);

  useEffect(() => {
    loadStandards();
  }, []);

  const loadStandards = async () => {
    const { data } = await supabase.from("standards").select(`*, attachments:standard_attachments(*)`).order("code");
    if (data) {
      const tree = data.filter((s) => !s.parent_id).map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        description: s.description,
        content: s.content,
        children: buildTree(data, s.id),
        attachments: s.attachments?.map((a: any) => ({ id: a.id, type: a.type, name: a.name, url: a.url, description: a.description })),
      }));
      setStandards(tree);
    }
  };

  const buildTree = (all: any[], parentId: string): any[] => {
    return all.filter((s) => s.parent_id === parentId).map((s) => ({
      id: s.id,
      code: s.code,
      title: s.title,
      description: s.description,
      children: buildTree(all, s.id),
    }));
  };

  return <div className="max-h-[60vh] overflow-y-auto"><StandardsTree standards={standards} onLinkStandard={(s) => onLink(s.id)} showLinkButton /></div>;
}
