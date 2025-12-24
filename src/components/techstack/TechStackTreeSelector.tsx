import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronDown, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DocsViewer } from "@/components/docs/DocsViewer";

interface TechStackItem {
  id: string;
  type: string | null;
  name: string;
  description?: string | null;
  long_description?: string | null;
  version?: string | null;
  version_constraint?: string | null;
  parent_id?: string | null;
  children?: TechStackItem[];
}

interface TechStack {
  id: string;
  name: string;
  description?: string | null;
  long_description?: string | null;
  items: TechStackItem[];
}

interface TechStackTreeSelectorProps {
  techStacks: TechStack[];
  selectedItems: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  allowedItemIds?: Set<string> | string[];
  preloadedItems?: boolean;
}

export function TechStackTreeSelector({
  techStacks: initialTechStacks,
  selectedItems,
  onSelectionChange,
  allowedItemIds,
  preloadedItems = false,
}: TechStackTreeSelectorProps) {
  const [expandedTechStacks, setExpandedTechStacks] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [techStacksWithItems, setTechStacksWithItems] = useState<TechStack[]>([]);
  const [loading, setLoading] = useState(!preloadedItems);
  const [docsStack, setDocsStack] = useState<TechStack | null>(null);

  useEffect(() => {
    if (preloadedItems) {
      setTechStacksWithItems(initialTechStacks);
      setLoading(false);
    } else {
      loadTechStackItems();
    }
  }, [initialTechStacks.map(ts => ts.id).join(','), preloadedItems]);

  const loadTechStackItems = async () => {
    setLoading(true);
    try {
      // Fetch ALL tech_stacks in one query (matching Standards pattern)
      const { data: allItems } = await supabase
        .from("tech_stacks")
        .select("*")
        .order("name");

      if (!allItems) {
        setTechStacksWithItems(initialTechStacks.map(s => ({ ...s, items: [] })));
        return;
      }

      const allowedIds =
        allowedItemIds instanceof Set
          ? allowedItemIds
          : allowedItemIds
          ? new Set(allowedItemIds)
          : null;

      const stacksWithItems: TechStack[] = [];

      for (const stack of initialTechStacks) {
        // Recursively collect all descendant IDs starting from this stack
        const descendantIds = new Set<string>();
        const collectDescendants = (parentId: string) => {
          allItems
            .filter((item) => item.parent_id === parentId)
            .forEach((item) => {
              descendantIds.add(item.id);
              collectDescendants(item.id);
            });
        };
        collectDescendants(stack.id);

        // Filter to only descendants of this stack
        let descendants = allItems.filter((item) => descendantIds.has(item.id));

        // Apply allowed filter if provided
        if (allowedIds) {
          descendants = descendants.filter((item) => allowedIds.has(item.id));
        }

        stacksWithItems.push({
          ...stack,
          items: buildItemsHierarchy(descendants),
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

    // Sort alphabetically by name
    const sortByName = (a: TechStackItem, b: TechStackItem) => 
      (a.name || '').localeCompare(b.name || '');

    const sortChildren = (items: TechStackItem[]) => {
      items.sort(sortByName);
      items.forEach(item => {
        if (item.children?.length) {
          sortChildren(item.children);
        }
      });
    };

    sortChildren(roots);
    return roots;
  };

  const getAllDescendants = (item: TechStackItem): string[] => {
    const descendants: string[] = [item.id];
    if (item.children) {
      item.children.forEach((child) => {
        descendants.push(...getAllDescendants(child));
      });
    }
    return descendants;
  };

  const getAllStackItems = (items: TechStackItem[]): string[] => {
    const ids: string[] = [];
    items.forEach((item) => {
      ids.push(...getAllDescendants(item));
    });
    return ids;
  };

  const areAllDescendantsSelected = (item: TechStackItem): boolean => {
    const descendants = getAllDescendants(item);
    return descendants.every((id) => selectedItems.has(id));
  };

  const areSomeDescendantsSelected = (item: TechStackItem): boolean => {
    const descendants = getAllDescendants(item);
    const selectedCount = descendants.filter((id) => selectedItems.has(id)).length;
    return selectedCount > 0 && selectedCount < descendants.length;
  };

  const areAllStackItemsSelected = (items: TechStackItem[]): boolean => {
    const allIds = getAllStackItems(items);
    return allIds.length > 0 && allIds.every((id) => selectedItems.has(id));
  };

  const areSomeStackItemsSelected = (items: TechStackItem[]): boolean => {
    const allIds = getAllStackItems(items);
    const selectedCount = allIds.filter((id) => selectedItems.has(id)).length;
    return selectedCount > 0 && selectedCount < allIds.length;
  };

  const toggleItem = (item: TechStackItem) => {
    const newSelected = new Set(selectedItems);
    const hasChildren = item.children && item.children.length > 0;
    
    if (!hasChildren) {
      if (newSelected.has(item.id)) {
        newSelected.delete(item.id);
      } else {
        newSelected.add(item.id);
      }
    } else {
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
      allIds.forEach((id) => newSelected.delete(id));
    } else {
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
    const versionDisplay = item.version ? `${item.version_constraint || "^"}${item.version}` : null;

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
            className="text-sm cursor-pointer flex-1 flex items-center gap-2"
          >
            {item.type && <span className="font-medium">{item.type}</span>}
            {item.type && " - "}{item.name}
            {versionDisplay && (
              <span className="text-xs font-mono text-muted-foreground bg-muted px-1 py-0.5 rounded">
                {versionDisplay}
              </span>
            )}
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
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setDocsStack(stack)}
                title="View documentation"
              >
                <BookOpen className="h-3.5 w-3.5" />
              </Button>
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

      {/* Docs Viewer */}
      {docsStack && (
        <DocsViewer
          open={!!docsStack}
          onClose={() => setDocsStack(null)}
          entityType="tech_stack"
          rootEntity={{
            id: docsStack.id,
            name: docsStack.name,
            description: docsStack.description,
            long_description: docsStack.long_description,
          }}
        />
      )}
    </div>
  );
}
