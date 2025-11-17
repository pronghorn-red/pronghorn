import { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LinkSelectorProps {
  type: "requirement" | "standard" | "tech_stack";
  projectId?: string;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onUnselect: (id: string) => void;
}

export function LinkSelector({ type, projectId, selectedIds, onSelect, onUnselect }: LinkSelectorProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadItems();
  }, [type, projectId]);

  const loadItems = async () => {
    setLoading(true);
    try {
      if (type === "requirement" && projectId) {
        const { data } = await supabase
          .from("requirements")
          .select("id, code, title, type, parent_id")
          .eq("project_id", projectId);
        
        // Build hierarchy and sort by code
        const hierarchical = buildHierarchy(data || []);
        setItems(hierarchical);
      } else if (type === "standard") {
        const { data } = await supabase
          .from("standards")
          .select("id, code, title, category_id, parent_id")
          .order("code");
        
        const hierarchical = buildHierarchy(data || []);
        setItems(hierarchical);
      } else if (type === "tech_stack") {
        const { data } = await supabase
          .from("tech_stacks")
          .select("id, name, description")
          .order("name");
        setItems(data || []);
      }
    } catch (error) {
      console.error("Error loading items:", error);
    } finally {
      setLoading(false);
    }
  };

  const buildHierarchy = (flatList: any[]): any[] => {
    const map = new Map<string, any>();
    const roots: any[] = [];

    // Sort by code first
    const sorted = [...flatList].sort((a, b) => {
      const codeA = a.code || "";
      const codeB = b.code || "";
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    });

    // Create nodes
    sorted.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    // Build tree
    sorted.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parent_id) {
        const parent = map.get(item.parent_id);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const flattenHierarchy = (items: any[], level = 0): any[] => {
    let result: any[] = [];
    items.forEach((item) => {
      result.push({ ...item, level });
      if (item.children && item.children.length > 0) {
        result = result.concat(flattenHierarchy(item.children, level + 1));
      }
    });
    return result;
  };

  const getDisplayLabel = (item: any) => {
    if (type === "tech_stack") {
      return item.name;
    }
    return `${item.code} - ${item.title}`;
  };

  const handleSelect = (searchValue: string) => {
    // Find the item by matching the display label (case-insensitive)
    const item = flattenHierarchy(items).find(
      (i) => getDisplayLabel(i).toLowerCase() === searchValue.toLowerCase()
    );
    
    if (item) {
      if (selectedIds.includes(item.id)) {
        onUnselect(item.id);
      } else {
        onSelect(item.id);
      }
    }
  };

  const getTypeLabel = () => {
    switch (type) {
      case "requirement":
        return "Requirements";
      case "standard":
        return "Standards";
      case "tech_stack":
        return "Tech Stacks";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedIds.length > 0
            ? `${selectedIds.length} ${getTypeLabel()} linked`
            : `Link ${getTypeLabel()}`}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 bg-card z-50">
        <Command>
          <CommandInput placeholder={`Search ${getTypeLabel().toLowerCase()}...`} />
          <CommandEmpty>No {getTypeLabel().toLowerCase()} found.</CommandEmpty>
          <CommandGroup>
            <ScrollArea className="h-[300px]">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading...</div>
              ) : (
                flattenHierarchy(items).map((item) => (
                  <CommandItem
                    key={item.id}
                    value={getDisplayLabel(item)}
                    onSelect={handleSelect}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        selectedIds.includes(item.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col" style={{ paddingLeft: `${item.level * 16}px` }}>
                      <span className="text-sm font-medium">
                        {getDisplayLabel(item)}
                      </span>
                      {type === "requirement" && (
                        <span className="text-xs text-muted-foreground">
                          {item.type}
                        </span>
                      )}
                      {type === "tech_stack" && item.description && (
                        <span className="text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))
              )}
            </ScrollArea>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}