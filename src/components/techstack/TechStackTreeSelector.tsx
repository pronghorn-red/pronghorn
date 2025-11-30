import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface TechStackItem {
  id: string;
  type: string | null;
  name: string;
  description?: string | null;
  parent_id?: string | null;
  children?: TechStackItem[];
}

interface TechStack {
  id: string;
  name: string;
  description?: string | null;
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
        // Load all child items for this tech stack (where parent_id = stack.id)
        const { data: childItems } = await supabase
          .from("tech_stacks")
          .select("*")
          .eq("parent_id", stack.id)
          .order("order_index");

        stacksWithItems.push({
          ...stack,
          items: buildItemsHierarchy(childItems || []),
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
      // For tech stack items, we need to check if parent_id exists in our fetched items
      // If not, it's a root item (direct child of the tech stack parent)
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  // Helper to get all descendant IDs from an item
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
  const getAllStackItems = (items: TechStackItem[]): string[] => {
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

  // Check if all items in stack are selected
  const areAllStackItemsSelected = (items: TechStackItem[]): boolean => {
    const allIds = getAllStackItems(items);
    return allIds.length > 0 && allIds.every((id) => selectedItems.has(id));
  };

  // Check if some items in stack are selected
  const areSomeStackItemsSelected = (items: TechStackItem[]): boolean => {
    const allIds = getAllStackItems(items);
    const selectedCount = allIds.filter((id) => selectedItems.has(id)).length;
    return selectedCount > 0 && selectedCount < allIds.length;
  };

  const toggleItem = (item: TechStackItem) => {
    const newSelected = new Set(selectedItems);
    const hasChildren = item.children && item.children.length > 0;
    
    if (!hasChildren) {
      // Leaf node - just toggle the item itself
      if (newSelected.has(item.id)) {
        newSelected.delete(item.id);
      } else {
        newSelected.add(item.id);
      }
    } else {
      // Has children - toggle all descendants
      const descendants = getAllDescendants(item);
      const allSelected = areAllDescendantsSelected(item);

      if (allSelected) {
        descendants.forEach((id) => newSelected.delete(id));
      } else {
        descendants.forEach((id) => newSelected.add(id));
      }
    }

    onSelectionChange(newSelected);
  };

  const toggleTechStack = (items: TechStackItem[]) => {
    const newSelected = new Set(selectedItems);
    const allIds = getAllStackItems(items);
    const allSelected = areAllStackItemsSelected(items);

    if (allSelected) {
      // Unselect all
      allIds.forEach((id) => newSelected.delete(id));
    } else {
      // Select all
      allIds.forEach((id) => newSelected.add(id));
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

  const handleSelectAll = () => {
    const allIds = new Set<string>();
    techStacksWithItems.forEach((stack) => {
      const stackIds = getAllStackItems(stack.items);
      stackIds.forEach((id) => allIds.add(id));
    });
    onSelectionChange(allIds);
  };

  const handleSelectNone = () => {
    onSelectionChange(new Set());
  };

  const renderItem = (item: TechStackItem, level: number = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    const isChecked = hasChildren 
      ? areAllDescendantsSelected(item)
      : selectedItems.has(item.id);
    const isIndeterminate = hasChildren && !isChecked && areSomeDescendantsSelected(item);

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
            checked={isIndeterminate ? "indeterminate" : isChecked}
            onCheckedChange={() => toggleItem(item)}
          />
          <Label
            htmlFor={`item-${item.id}`}
            className="text-sm cursor-pointer flex-1"
          >
            {item.type && <span className="font-medium">{item.type}</span>}
            {item.type && " - "}{item.name}
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
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button variant="outline" size="sm" onClick={handleSelectNone}>
          Select None
        </Button>
      </div>
      <div className="space-y-2">
        {techStacksWithItems.map((stack) => {
        const isExpanded = expandedTechStacks.has(stack.id);
        const hasItems = stack.items.length > 0;
        const allSelected = areAllStackItemsSelected(stack.items);
        const someSelected = areSomeStackItemsSelected(stack.items);

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
                checked={someSelected && !allSelected ? "indeterminate" : allSelected}
                onCheckedChange={() => toggleTechStack(stack.items)}
                disabled={!hasItems}
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
    </div>
  );
}