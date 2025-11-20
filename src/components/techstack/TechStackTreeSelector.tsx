import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface TechStackItem {
  id: string;
  type: string;
  name: string;
  description?: string;
  parent_id?: string;
  children?: TechStackItem[];
}

interface TechStack {
  id: string;
  name: string;
  description?: string;
  items: TechStackItem[];
}

interface TechStackTreeSelectorProps {
  techStacks: TechStack[];
  selectedItems: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
}

export function TechStackTreeSelector({
  techStacks: initialTechStacks,
  selectedItems,
  onSelectionChange,
}: TechStackTreeSelectorProps) {
  const [expandedTechStacks, setExpandedTechStacks] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [techStacksWithItems, setTechStacksWithItems] = useState<TechStack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTechStackItems();
  }, [initialTechStacks.map(ts => ts.id).join(',')]);

  const loadTechStackItems = async () => {
    setLoading(true);
    try {
      const stacksWithItems: TechStack[] = [];

      for (const stack of initialTechStacks) {
        const { data: items } = await supabase
          .from("tech_stacks")
          .select("metadata")
          .eq("id", stack.id)
          .single();

        const metadata = items?.metadata as any;
        const itemsArray = metadata?.items || [];
        
        stacksWithItems.push({
          ...stack,
          items: buildItemsHierarchy(itemsArray),
        });
      }

      setTechStacksWithItems(stacksWithItems);
    } catch (error) {
      console.error("Error loading tech stack items:", error);
    } finally {
      setLoading(false);
    }
  };

  const buildItemsHierarchy = (flatItems: any[]): TechStackItem[] => {
    const map = new Map<string, TechStackItem>();
    const roots: TechStackItem[] = [];

    flatItems.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    flatItems.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  // Helper to get all descendant IDs
  const getAllDescendants = (item: TechStackItem): string[] => {
    const descendants: string[] = [item.id];
    if (item.children) {
      item.children.forEach((child) => {
        descendants.push(...getAllDescendants(child));
      });
    }
    return descendants;
  };

  // Helper to get all item IDs in a tech stack
  const getAllTechStackItems = (items: TechStackItem[]): string[] => {
    const ids: string[] = [];
    items.forEach((item) => {
      ids.push(...getAllDescendants(item));
    });
    return ids;
  };

  // Check if all descendants are selected
  const areAllDescendantsSelected = (item: TechStackItem): boolean => {
    const descendants = getAllDescendants(item);
    return descendants.every((id) => selectedItems.has(id));
  };

  // Check if some (but not all) descendants are selected
  const areSomeDescendantsSelected = (item: TechStackItem): boolean => {
    const descendants = getAllDescendants(item);
    const selectedCount = descendants.filter((id) => selectedItems.has(id)).length;
    return selectedCount > 0 && selectedCount < descendants.length;
  };

  // Check if all items in tech stack are selected
  const areAllTechStackItemsSelected = (items: TechStackItem[]): boolean => {
    const allIds = getAllTechStackItems(items);
    return allIds.length > 0 && allIds.every((id) => selectedItems.has(id));
  };

  // Check if some items in tech stack are selected
  const areSomeTechStackItemsSelected = (items: TechStackItem[]): boolean => {
    const allIds = getAllTechStackItems(items);
    const selectedCount = allIds.filter((id) => selectedItems.has(id)).length;
    return selectedCount > 0 && selectedCount < allIds.length;
  };

  const toggleItem = (item: TechStackItem) => {
    const newSelected = new Set(selectedItems);
    const descendants = getAllDescendants(item);
    const allSelected = areAllDescendantsSelected(item);

    if (allSelected) {
      // Unselect all descendants
      descendants.forEach((id) => newSelected.delete(id));
    } else {
      // Select all descendants
      descendants.forEach((id) => newSelected.add(id));
    }

    onSelectionChange(newSelected);
  };

  const toggleTechStack = (stackId: string, items: TechStackItem[]) => {
    const newSelected = new Set(selectedItems);
    
    if (items.length === 0) {
      // If no items, toggle the tech stack ID itself
      if (newSelected.has(stackId)) {
        newSelected.delete(stackId);
      } else {
        newSelected.add(stackId);
      }
    } else {
      // If has items, toggle all item IDs
      const allIds = getAllTechStackItems(items);
      const allSelected = areAllTechStackItemsSelected(items);

      if (allSelected) {
        // Unselect all
        allIds.forEach((id) => newSelected.delete(id));
      } else {
        // Select all
        allIds.forEach((id) => newSelected.add(id));
      }
    }

    onSelectionChange(newSelected);
  };

  const toggleExpandTechStack = (techStackId: string) => {
    const newExpanded = new Set(expandedTechStacks);
    if (newExpanded.has(techStackId)) {
      newExpanded.delete(techStackId);
    } else {
      newExpanded.add(techStackId);
    }
    setExpandedTechStacks(newExpanded);
  };

  const toggleExpandItem = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const renderItem = (item: TechStackItem, level: number = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    const isChecked = areAllDescendantsSelected(item);
    const isIndeterminate = !isChecked && areSomeDescendantsSelected(item);

    return (
      <div key={item.id} className="space-y-1">
        <div
          className="flex items-center gap-2 py-1 hover:bg-muted/50 rounded px-2"
          style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
        >
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => toggleExpandItem(item.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          )}
          {!hasChildren && <div className="w-5" />}
          <Checkbox
            id={`item-${item.id}`}
            checked={isChecked}
            className={isIndeterminate ? "data-[state=checked]:bg-primary/50" : ""}
            onCheckedChange={() => toggleItem(item)}
          />
          <Label
            htmlFor={`item-${item.id}`}
            className="text-sm cursor-pointer flex-1"
          >
            <span className="font-medium">{item.type}</span> - {item.name}
          </Label>
        </div>
        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {item.children!.map((child) => renderItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading tech stacks...</div>;
  }

  return (
    <div className="space-y-2">
      {techStacksWithItems.map((stack) => {
        const isExpanded = expandedTechStacks.has(stack.id);
        const hasItems = stack.items.length > 0;
        const allSelected = hasItems 
          ? areAllTechStackItemsSelected(stack.items)
          : selectedItems.has(stack.id);
        const someSelected = hasItems && areSomeTechStackItemsSelected(stack.items);

        return (
          <div key={stack.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              {hasItems && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => toggleExpandTechStack(stack.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              )}
              {!hasItems && <div className="w-6" />}
              <Checkbox
                id={`stack-${stack.id}`}
                checked={allSelected}
                className={someSelected && !allSelected ? "data-[state=checked]:bg-primary/50" : ""}
                onCheckedChange={() => toggleTechStack(stack.id, stack.items)}
              />
              <Label
                htmlFor={`stack-${stack.id}`}
                className="font-semibold cursor-pointer flex-1"
              >
                {stack.name}
              </Label>
            </div>
            {stack.description && (
              <p className="text-xs text-muted-foreground pl-14">{stack.description}</p>
            )}
            {isExpanded && hasItems && (
              <div className="space-y-1 pt-2">
                {stack.items.map((item) => renderItem(item, 0))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
