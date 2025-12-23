import { useState, useEffect } from "react";
import { X, ChevronRight, FileText, Folder, Search, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { ResourceManager } from "@/components/resources/ResourceManager";

interface DocsItem {
  id: string;
  name?: string;
  title?: string;
  code?: string;
  type?: string | null;
  description?: string | null;
  long_description?: string | null;
  version?: string | null;
  version_constraint?: string | null;
  children?: DocsItem[];
  parent_id?: string | null;
}

interface DocsViewerProps {
  open: boolean;
  onClose: () => void;
  entityType: "tech_stack" | "standard" | "standard_category";
  rootEntity: {
    id: string;
    name: string;
    description?: string | null;
    long_description?: string | null;
  };
}

export function DocsViewer({ open, onClose, entityType, rootEntity }: DocsViewerProps) {
  const [items, setItems] = useState<DocsItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<DocsItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && rootEntity.id) {
      loadItems();
      // Select root by default
      setSelectedItem({
        id: rootEntity.id,
        name: rootEntity.name,
        title: rootEntity.name,
        description: rootEntity.description,
        long_description: rootEntity.long_description,
      });
    }
  }, [open, rootEntity.id]);

  const loadItems = async () => {
    if (entityType === "tech_stack") {
      const { data } = await supabase
        .from("tech_stacks")
        .select("*")
        .eq("parent_id", rootEntity.id)
        .order("order_index");
      
      if (data) {
        setItems(buildHierarchy(data, rootEntity.id));
      }
    } else if (entityType === "standard_category") {
      const { data } = await supabase
        .from("standards")
        .select("*")
        .eq("category_id", rootEntity.id)
        .order("order_index");
      
      if (data) {
        setItems(buildStandardsHierarchy(data));
      }
    }
  };

  const buildHierarchy = (flatItems: any[], rootId: string): DocsItem[] => {
    const map = new Map<string, DocsItem>();
    const roots: DocsItem[] = [];

    flatItems.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    flatItems.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parent_id && item.parent_id !== rootId && map.has(item.parent_id)) {
        map.get(item.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const buildStandardsHierarchy = (flatItems: any[]): DocsItem[] => {
    const map = new Map<string, DocsItem>();
    const roots: DocsItem[] = [];

    flatItems.forEach((item) => {
      map.set(item.id, { ...item, name: item.title, children: [] });
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

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filterItems = (items: DocsItem[], query: string): DocsItem[] => {
    if (!query.trim()) return items;
    
    const searchLower = query.toLowerCase();
    
    const matchesSearch = (item: DocsItem): boolean => {
      const name = item.name || item.title || "";
      const desc = item.description || "";
      const longDesc = item.long_description || "";
      return (
        name.toLowerCase().includes(searchLower) ||
        desc.toLowerCase().includes(searchLower) ||
        longDesc.toLowerCase().includes(searchLower)
      );
    };

    const filterRecursive = (items: DocsItem[]): DocsItem[] => {
      return items.reduce<DocsItem[]>((acc, item) => {
        const childMatches = item.children ? filterRecursive(item.children) : [];
        if (matchesSearch(item) || childMatches.length > 0) {
          acc.push({
            ...item,
            children: childMatches.length > 0 ? childMatches : item.children,
          });
        }
        return acc;
      }, []);
    };

    return filterRecursive(items);
  };

  const filteredItems = filterItems(items, searchQuery);
  const displayName = selectedItem?.name || selectedItem?.title || rootEntity.name;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-4xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {rootEntity.name} Documentation
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r flex flex-col shrink-0">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-2">
                {/* Root item */}
                <button
                  onClick={() => setSelectedItem({
                    id: rootEntity.id,
                    name: rootEntity.name,
                    title: rootEntity.name,
                    description: rootEntity.description,
                    long_description: rootEntity.long_description,
                  })}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedItem?.id === rootEntity.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  Overview
                </button>

                <Separator className="my-2" />

                {/* Child items */}
                {filteredItems.map((item) => (
                  <NavItem
                    key={item.id}
                    item={item}
                    level={0}
                    selectedId={selectedItem?.id}
                    expandedIds={expandedIds}
                    onSelect={setSelectedItem}
                    onToggle={toggleExpand}
                    entityType={entityType}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-6 max-w-3xl">
              {selectedItem ? (
                <div className="space-y-6">
                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {selectedItem.code && (
                        <Badge variant="outline">{selectedItem.code}</Badge>
                      )}
                      {selectedItem.type && (
                        <Badge variant="secondary">{selectedItem.type}</Badge>
                      )}
                      {selectedItem.version && (
                        <Badge variant="outline" className="font-mono">
                          {selectedItem.version_constraint || "^"}{selectedItem.version}
                        </Badge>
                      )}
                    </div>
                    <h1 className="text-2xl font-bold">{displayName}</h1>
                    {selectedItem.description && (
                      <p className="text-muted-foreground mt-2">{selectedItem.description}</p>
                    )}
                  </div>

                  <Separator />

                  {/* Long description as markdown */}
                  {selectedItem.long_description ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedItem.long_description}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic">
                      No detailed documentation available for this item.
                    </p>
                  )}

                  {/* Resources */}
                  {selectedItem.id !== rootEntity.id && (
                    <div className="mt-8">
                      <h3 className="text-lg font-semibold mb-4">Resources</h3>
                      <ResourceManager
                        entityType={entityType === "standard_category" ? "standard" : entityType}
                        entityId={selectedItem.id}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Select an item from the sidebar
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NavItem({
  item,
  level,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  entityType,
}: {
  item: DocsItem;
  level: number;
  selectedId?: string;
  expandedIds: Set<string>;
  onSelect: (item: DocsItem) => void;
  onToggle: (id: string) => void;
  entityType: string;
}) {
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedIds.has(item.id);
  const isSelected = selectedId === item.id;
  const displayName = item.name || item.title || "Untitled";

  return (
    <div>
      <div
        className={`flex items-center gap-1 group ${level > 0 ? "ml-3" : ""}`}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggle(item.id)}
            className="p-1 hover:bg-muted rounded"
          >
            <ChevronRight
              className={`h-3 w-3 text-muted-foreground transition-transform ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
          </button>
        ) : (
          <span className="w-5" />
        )}
        
        <button
          onClick={() => onSelect(item)}
          className={`flex-1 text-left px-2 py-1.5 rounded-md text-sm transition-colors truncate ${
            isSelected
              ? "bg-primary/10 text-primary font-medium"
              : "hover:bg-muted text-foreground"
          }`}
        >
          {displayName}
        </button>
      </div>

      {hasChildren && isExpanded && (
        <div className="border-l border-border ml-2.5 pl-1 mt-0.5">
          {item.children!.map((child) => (
            <NavItem
              key={child.id}
              item={child}
              level={level + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              entityType={entityType}
            />
          ))}
        </div>
      )}
    </div>
  );
}
