import { useState, useEffect } from "react";
import { 
  ChevronRight, 
  FileText, 
  Search, 
  FolderTree,
  BookOpen,
  Layers
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { ResourceManager } from "@/components/resources/ResourceManager";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();

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
      const code = item.code || "";
      const desc = item.description || "";
      return (
        name.toLowerCase().includes(searchLower) ||
        code.toLowerCase().includes(searchLower) ||
        desc.toLowerCase().includes(searchLower)
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

  // Content panel component shared between desktop and mobile
  const ContentPanel = () => (
    <div className={isMobile ? "p-4" : "p-6 max-w-4xl"}>
      {selectedItem ? (
        <div className="space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {selectedItem.id === rootEntity.id && (
                <Badge className="gap-1">
                  <FolderTree className="h-3 w-3" />
                  {entityType === "tech_stack" ? "Tech Stack" : "Standard Category"}
                </Badge>
              )}
              {selectedItem.code && (
                <Badge variant="outline" className="font-mono">{selectedItem.code}</Badge>
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
            <h1 className={isMobile ? "text-xl font-bold" : "text-2xl font-bold"}>{displayName}</h1>
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

          {/* Children summary */}
          {selectedItem.children && selectedItem.children.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-3">Contains</h3>
              <div className="grid gap-2">
                {selectedItem.children.map(child => (
                  <button
                    key={child.id}
                    onClick={() => {
                      setSelectedItem(child);
                      setExpandedIds(prev => new Set([...prev, selectedItem.id]));
                    }}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:border-primary/50 hover:bg-muted/50 transition-colors text-left"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm break-words">
                        {child.code && <span className="text-muted-foreground mr-2">{child.code}</span>}
                        {child.name || child.title}
                      </div>
                      {child.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{child.description}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
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
  );

  // Mobile Layout - Accordion navigation
  const MobileLayout = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mobile Toolbar */}
      <div className="p-3 border-b bg-muted/30 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-10 text-sm"
          />
        </div>
      </div>

      {/* Mobile Navigation Accordion */}
      <div className="border-b shrink-0">
        {/* Overview Button */}
        <button
          onClick={() => setSelectedItem({
            id: rootEntity.id,
            name: rootEntity.name,
            title: rootEntity.name,
            description: rootEntity.description,
            long_description: rootEntity.long_description,
          })}
          className={`w-full flex items-center gap-3 text-left px-4 py-3 text-sm font-medium transition-colors border-b ${
            selectedItem?.id === rootEntity.id
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted"
          }`}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          <span className="break-words">Overview</span>
        </button>

        <Accordion type="multiple" className="w-full">
          <AccordionItem value="items" className="border-b-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <FolderTree className="h-3.5 w-3.5" />
                {entityType === "tech_stack" ? "Components" : "Standards"}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="space-y-1 px-2 pb-2">
                {filteredItems.map((item) => (
                  <MobileNavItem
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Mobile Content */}
      <ScrollArea className="flex-1">
        <ContentPanel />
      </ScrollArea>
    </div>
  );

  // Desktop Layout - Resizable panels
  const DesktopLayout = () => (
    <div className="h-full">
      <ResizablePanelGroup direction="horizontal">
        {/* Sidebar */}
        <ResizablePanel defaultSize={30} minSize={15} maxSize={40}>
          <div className="h-full flex flex-col bg-muted/30">
            <div className="p-3 border-b bg-background">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {/* Overview */}
                <button
                  onClick={() => setSelectedItem({
                    id: rootEntity.id,
                    name: rootEntity.name,
                    title: rootEntity.name,
                    description: rootEntity.description,
                    long_description: rootEntity.long_description,
                  })}
                  className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedItem?.id === rootEntity.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  Overview
                </button>

                <Separator className="my-3" />

                {/* Items */}
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
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Content */}
        <ResizablePanel defaultSize={70}>
          <ScrollArea className="h-full">
            <ContentPanel />
          </ScrollArea>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-4xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              {rootEntity.name} Documentation
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-hidden">
          {isMobile ? <MobileLayout /> : <DesktopLayout />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Desktop Nav Item
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

  // Get icon based on entity type and whether it has children
  const getIcon = () => {
    if (entityType === "tech_stack") {
      return <Layers className="h-4 w-4 text-primary shrink-0" />;
    } else {
      // Standards
      return hasChildren 
        ? <FolderTree className="h-4 w-4 text-amber-500 shrink-0" />
        : <FileText className="h-4 w-4 text-blue-500 shrink-0" />;
    }
  };

  return (
    <div>
      <button
        onClick={() => {
          onSelect(item);
          if (hasChildren) onToggle(item.id);
        }}
        className={`w-full flex items-center gap-2 text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
          isSelected
            ? "bg-primary/10 text-primary font-medium"
            : "hover:bg-muted text-foreground"
        }`}
        style={{ paddingLeft: `${12 + level * 12}px` }}
      >
        {hasChildren && (
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        )}
        {!hasChildren && <span className="w-3.5" />}
        {getIcon()}
        <span className="truncate">{displayName}</span>
      </button>

      {hasChildren && isExpanded && (
        <div className="mt-0.5">
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

// Mobile Nav Item
function MobileNavItem({
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

  // Get icon based on entity type and whether it has children
  const getIcon = () => {
    if (entityType === "tech_stack") {
      return <Layers className="h-4 w-4 text-primary shrink-0" />;
    } else {
      // Standards
      return hasChildren 
        ? <FolderTree className="h-4 w-4 text-amber-500 shrink-0" />
        : <FileText className="h-4 w-4 text-blue-500 shrink-0" />;
    }
  };

  return (
    <div>
      <button
        onClick={() => {
          onSelect(item);
          if (hasChildren) onToggle(item.id);
        }}
        className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-md text-sm transition-colors ${
          isSelected
            ? "bg-primary/10 text-primary font-medium"
            : "hover:bg-muted text-foreground"
        }`}
        style={{ paddingLeft: `${12 + level * 12}px` }}
      >
        {hasChildren && (
          <ChevronRight
            className={`h-4 w-4 shrink-0 transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        )}
        {!hasChildren && <span className="w-4" />}
        {getIcon()}
        <span className="truncate">{displayName}</span>
      </button>

      {hasChildren && isExpanded && (
        <div className="mt-0.5">
          {item.children!.map((child) => (
            <MobileNavItem
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
