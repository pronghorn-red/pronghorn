import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

interface TechStack {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

export function TechStackSelector({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
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
    const { data } = await supabase.rpc("get_project_tech_stacks_with_token", {
      p_project_id: projectId,
      p_token: shareToken || null
    });
    setSelectedIds(data?.map((d: any) => d.tech_stack_id) || []);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Get existing tech stacks
      const { data: existing } = await supabase.rpc("get_project_tech_stacks_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null
      });

      // Delete all existing
      if (existing && existing.length > 0) {
        for (const item of existing) {
          await supabase.rpc("delete_project_tech_stack_with_token", {
            p_id: item.id,
            p_token: shareToken || null
          });
        }
      }

      // Insert new selections
      for (const techStackId of selectedIds) {
        await supabase.rpc("insert_project_tech_stack_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null,
          p_tech_stack_id: techStackId
        });
      }

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

      // Get all requirements for this project (use RPC with token)
      const { data: requirements } = await supabase.rpc("get_requirements_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null
      });

      if (!requirements || requirements.length === 0) return;

      // Link each standard to each requirement (this creates the linkage)
      // In a real system, you might want more granular control
      for (const req of requirements) {
        for (const ss of stackStandards) {
          try {
            await supabase.rpc("insert_requirement_standard_with_token", {
              p_requirement_id: req.id,
              p_token: shareToken || null,
              p_standard_id: ss.standard_id,
              p_notes: null
            });
          } catch (err) {
            // Ignore duplicate errors (already linked)
          }
        }
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
