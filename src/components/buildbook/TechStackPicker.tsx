import { useState, useEffect } from "react";
import { Layers, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface TechStack {
  id: string;
  name: string;
  description: string | null;
}

interface TechStackPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function TechStackPicker({ selectedIds, onChange }: TechStackPickerProps) {
  const [techStacks, setTechStacks] = useState<TechStack[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTechStacks();
  }, []);

  const loadTechStacks = async () => {
    try {
      const { data, error } = await supabase
        .from("tech_stacks")
        .select("id, name, description")
        .order("name");

      if (error) throw error;
      setTechStacks(data || []);
    } catch (error) {
      console.error("Error loading tech stacks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelected = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((sid) => sid !== id)
        : [...selectedIds, id]
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (techStacks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No tech stacks available
      </div>
    );
  }

  return (
    <div className="border rounded-md max-h-[300px] overflow-y-auto p-2">
      {techStacks.map((stack) => {
        const isSelected = selectedIds.includes(stack.id);
        return (
          <div
            key={stack.id}
            className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted cursor-pointer"
            onClick={() => toggleSelected(stack.id)}
          >
            <Checkbox checked={isSelected} />
            <Layers className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{stack.name}</span>
              {stack.description && (
                <p className="text-xs text-muted-foreground truncate">
                  {stack.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
