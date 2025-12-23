import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, Library } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface StandardCategory {
  id: string;
  name: string;
  description: string | null;
  children?: StandardCategory[];
}

interface StandardsCategoryPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function StandardsCategoryPicker({ selectedIds, onChange }: StandardsCategoryPickerProps) {
  const [categories, setCategories] = useState<StandardCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("standard_categories")
        .select("id, name, description")
        .order("name");

      if (error) throw error;
      setCategories((data || []).map(cat => ({ ...cat, children: [] })));
    } catch (error) {
      console.error("Error loading categories:", error);
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

  if (categories.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No standard categories available
      </div>
    );
  }

  return (
    <div className="border rounded-md max-h-[300px] overflow-y-auto p-2">
      {categories.map((category) => {
        const isSelected = selectedIds.includes(category.id);
        return (
          <div
            key={category.id}
            className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted cursor-pointer"
            onClick={() => toggleSelected(category.id)}
          >
            <Checkbox checked={isSelected} />
            <Library className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm flex-1">{category.name}</span>
          </div>
        );
      })}
    </div>
  );
}
