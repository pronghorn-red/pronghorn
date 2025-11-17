import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface TechStack {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

export function TechStackSelector({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const [stacks, setStacks] = useState<TechStack[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadStacks();
      loadSelected();
    }
  }, [open, projectId]);

  const loadStacks = async () => {
    const { data } = await supabase.from("tech_stacks").select("*").order("name");
    setStacks(data || []);
  };

  const loadSelected = async () => {
    const { data } = await supabase.from("project_tech_stacks").select("tech_stack_id").eq("project_id", projectId);
    setSelectedIds(data?.map((d) => d.tech_stack_id) || []);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Remove unselected
      const { error: deleteError } = await supabase.from("project_tech_stacks").delete().eq("project_id", projectId).not("tech_stack_id", "in", `(${selectedIds.join(",")})`);
      if (deleteError) throw deleteError;

      // Add new selections
      const toAdd = selectedIds.map((sid) => ({ project_id: projectId, tech_stack_id: sid }));
      const { error: insertError } = await supabase.from("project_tech_stacks").upsert(toAdd, { onConflict: "project_id,tech_stack_id" });
      if (insertError) throw insertError;

      // Auto-link all standards from selected tech stacks
      await linkStandardsFromStacks();

      toast.success("Tech stacks updated and standards linked");
      onClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const linkStandardsFromStacks = async () => {
    try {
      // Get all standards from selected tech stacks
      const { data: stackStandards } = await supabase.from("tech_stack_standards").select("standard_id, tech_stack_id").in("tech_stack_id", selectedIds);

      if (!stackStandards || stackStandards.length === 0) return;

      // Get all requirements for this project
      const { data: requirements } = await supabase.from("requirements").select("id").eq("project_id", projectId);

      if (!requirements || requirements.length === 0) return;

      // Link each standard to each requirement (this creates the linkage)
      // In a real system, you might want more granular control
      const links = requirements.flatMap((req) => stackStandards.map((ss) => ({ requirement_id: req.id, standard_id: ss.standard_id })));

      if (links.length > 0) {
        await supabase.from("requirement_standards").upsert(links, { onConflict: "requirement_id,standard_id", ignoreDuplicates: true });
      }
    } catch (error) {
      console.error("Error linking standards:", error);
    }
  };

  const toggleStack = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Tech Stacks</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {stacks.map((stack) => (
            <div key={stack.id} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50">
              <Checkbox id={stack.id} checked={selectedIds.includes(stack.id)} onCheckedChange={() => toggleStack(stack.id)} />
              <Label htmlFor={stack.id} className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  {stack.icon && <span>{stack.icon}</span>}
                  <div>
                    <div className="font-medium">{stack.name}</div>
                    {stack.description && <div className="text-xs text-muted-foreground">{stack.description}</div>}
                  </div>
                </div>
              </Label>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>{loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save & Link Standards</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
