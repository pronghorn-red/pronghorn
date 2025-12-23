import { useState, useEffect, useCallback } from "react";
import { 
  ChevronRight, 
  FileText, 
  Search, 
  Library, 
  Layers, 
  BookOpen,
  FolderTree
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { ResourceManager } from "@/components/resources/ResourceManager";
import { BuildBook, BuildBookStandard, BuildBookTechStack } from "@/hooks/useRealtimeBuildBooks";
import { BuildBookChat } from "./BuildBookChat";

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
  itemType: "overview" | "standard_category" | "standard" | "tech_stack";
}

interface StandardCategory {
  id: string;
  name: string;
  description: string | null;
  long_description: string | null;
}

interface Standard {
  id: string;
  code: string;
  title: string;
  description: string | null;
  long_description: string | null;
  category_id: string;
  parent_id: string | null;
  order_index: number;
}

interface TechStack {
  id: string;
  name: string;
  description: string | null;
  long_description: string | null;
  type: string | null;
  version: string | null;
  version_constraint: string | null;
  parent_id: string | null;
  order_index: number;
}

interface BuildBookDocsViewerProps {
  buildBook: BuildBook;
  standards: BuildBookStandard[];
  techStacks: BuildBookTechStack[];
}

export function BuildBookDocsViewer({ buildBook, standards, techStacks }: BuildBookDocsViewerProps) {
  const [standardCategories, setStandardCategories] = useState<Map<string, StandardCategory & { standards: DocsItem[] }>>(new Map());
  const [techStackItems, setTechStackItems] = useState<DocsItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<DocsItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Load all standards and tech stacks with full hierarchy
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load standards
      if (standards.length > 0) {
        const standardIds = standards.map(s => s.standard_id);
        
        // Get the selected standards
        const { data: selectedStandards } = await supabase
          .from("standards")
          .select("*")
          .in("id", standardIds);

        if (selectedStandards && selectedStandards.length > 0) {
          // Get unique category IDs
          const categoryIds = [...new Set(selectedStandards.map(s => s.category_id))];
          
          // Load categories
          const { data: categories } = await supabase
            .from("standard_categories")
            .select("*")
            .in("id", categoryIds);

          // For each category, load ALL standards (not just selected ones) to show full hierarchy
          const categoriesWithStandards = new Map<string, StandardCategory & { standards: DocsItem[] }>();
          
          for (const category of categories || []) {
            const { data: categoryStandards } = await supabase
              .from("standards")
              .select("*")
              .eq("category_id", category.id)
              .order("order_index");

            const standardsHierarchy = buildStandardsHierarchy(categoryStandards || [], standardIds);
            
            categoriesWithStandards.set(category.id, {
              ...category,
              standards: standardsHierarchy,
            });
          }
          
          setStandardCategories(categoriesWithStandards);
        }
      }

      // Load tech stacks
      if (techStacks.length > 0) {
        const techStackIds = techStacks.map(t => t.tech_stack_id);
        
        // Get the selected tech stacks
        const { data: selectedTechStacks } = await supabase
          .from("tech_stacks")
          .select("*")
          .in("id", techStackIds)
          .order("order_index");

        if (selectedTechStacks && selectedTechStacks.length > 0) {
          // Find root items (those without parent_id or whose parent is not in our selection)
          const selectedIds = new Set(techStackIds);
          const rootItems = selectedTechStacks.filter(
            ts => !ts.parent_id || !selectedIds.has(ts.parent_id)
          );

          // For each root item, load its children
          const techStacksWithChildren: DocsItem[] = [];
          
          for (const root of rootItems) {
            const { data: children } = await supabase
              .from("tech_stacks")
              .select("*")
              .eq("parent_id", root.id)
              .order("order_index");

            const item = buildTechStackHierarchy(root, children || [], selectedIds);
            techStacksWithChildren.push(item);
          }
          
          setTechStackItems(techStacksWithChildren);
        }
      }

      // Select overview by default
      setSelectedItem({
        id: "overview",
        name: buildBook.name,
        description: buildBook.short_description,
        long_description: buildBook.long_description,
        itemType: "overview",
      });
    } catch (error) {
      console.error("Error loading build book data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [buildBook, standards, techStacks]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const buildStandardsHierarchy = (flatItems: Standard[], selectedIds: string[]): DocsItem[] => {
    const map = new Map<string, DocsItem>();
    const roots: DocsItem[] = [];
    const selectedSet = new Set(selectedIds);

    flatItems.forEach((item) => {
      map.set(item.id, {
        id: item.id,
        code: item.code,
        title: item.title,
        name: item.title,
        description: item.description,
        long_description: item.long_description,
        parent_id: item.parent_id,
        itemType: "standard",
        children: [],
      });
    });

    flatItems.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    // Filter to only include selected standards and their ancestors/descendants
    const filterSelected = (items: DocsItem[]): DocsItem[] => {
      return items.filter(item => {
        const hasSelectedDescendant = (node: DocsItem): boolean => {
          if (selectedSet.has(node.id)) return true;
          return node.children?.some(hasSelectedDescendant) || false;
        };
        return hasSelectedDescendant(item);
      }).map(item => ({
        ...item,
        children: item.children ? filterSelected(item.children) : [],
      }));
    };

    return filterSelected(roots);
  };

  const buildTechStackHierarchy = (root: TechStack, children: TechStack[], selectedIds: Set<string>): DocsItem => {
    return {
      id: root.id,
      name: root.name,
      description: root.description,
      long_description: root.long_description,
      type: root.type,
      version: root.version,
      version_constraint: root.version_constraint,
      itemType: "tech_stack",
      children: children.map(child => ({
        id: child.id,
        name: child.name,
        description: child.description,
        long_description: child.long_description,
        type: child.type,
        version: child.version,
        version_constraint: child.version_constraint,
        itemType: "tech_stack" as const,
        children: [],
      })),
    };
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

  const matchesSearch = (item: DocsItem, query: string): boolean => {
    const searchLower = query.toLowerCase();
    const name = item.name || item.title || "";
    const code = item.code || "";
    const desc = item.description || "";
    return (
      name.toLowerCase().includes(searchLower) ||
      code.toLowerCase().includes(searchLower) ||
      desc.toLowerCase().includes(searchLower)
    );
  };

  const filterItems = (items: DocsItem[], query: string): DocsItem[] => {
    if (!query.trim()) return items;
    
    const filterRecursive = (items: DocsItem[]): DocsItem[] => {
      return items.reduce<DocsItem[]>((acc, item) => {
        const childMatches = item.children ? filterRecursive(item.children) : [];
        if (matchesSearch(item, query) || childMatches.length > 0) {
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

  const displayName = selectedItem?.name || selectedItem?.title || buildBook.name;

  // Convert Map to array for rendering
  const standardCategoriesArray = Array.from(standardCategories.values());

  return (
    <div className="h-[calc(100vh-200px)] min-h-[500px] border rounded-lg overflow-hidden bg-background">
      <ResizablePanelGroup direction="horizontal">
        {/* Sidebar */}
        <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
          <div className="h-full flex flex-col bg-muted/30">
            <div className="p-3 border-b bg-background flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <BuildBookChat
                buildBook={buildBook}
                standards={standards}
                techStacks={techStacks}
              />
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {/* Overview */}
                <button
                  onClick={() => setSelectedItem({
                    id: "overview",
                    name: buildBook.name,
                    description: buildBook.short_description,
                    long_description: buildBook.long_description,
                    itemType: "overview",
                  })}
                  className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedItem?.id === "overview"
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  Overview
                </button>

                {/* Standards Section */}
                {standardCategoriesArray.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Library className="h-3.5 w-3.5" />
                      Standards
                    </div>
                    {standardCategoriesArray.map((category) => (
                      <CategoryNavItem
                        key={category.id}
                        category={category}
                        standards={filterItems(category.standards, searchQuery)}
                        selectedId={selectedItem?.id}
                        expandedIds={expandedIds}
                        onSelect={setSelectedItem}
                        onToggle={toggleExpand}
                      />
                    ))}
                  </>
                )}

                {/* Tech Stacks Section */}
                {techStackItems.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5" />
                      Tech Stacks
                    </div>
                    {filterItems(techStackItems, searchQuery).map((item) => (
                      <NavItem
                        key={item.id}
                        item={item}
                        level={0}
                        selectedId={selectedItem?.id}
                        expandedIds={expandedIds}
                        onSelect={setSelectedItem}
                        onToggle={toggleExpand}
                        icon={<Layers className="h-4 w-4 text-primary" />}
                      />
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Content */}
        <ResizablePanel defaultSize={75}>
          <ScrollArea className="h-full">
            <div className="p-6 max-w-4xl">
              {isLoading ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Loading documentation...
                </div>
              ) : selectedItem ? (
                <div className="space-y-6">
                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {selectedItem.itemType === "overview" && (
                        <Badge className="gap-1">
                          <BookOpen className="h-3 w-3" />
                          Build Book
                        </Badge>
                      )}
                      {selectedItem.itemType === "standard_category" && (
                        <Badge variant="secondary" className="gap-1">
                          <FolderTree className="h-3 w-3" />
                          Category
                        </Badge>
                      )}
                      {selectedItem.itemType === "standard" && selectedItem.code && (
                        <Badge variant="outline" className="font-mono">{selectedItem.code}</Badge>
                      )}
                      {selectedItem.itemType === "tech_stack" && (
                        <>
                          {selectedItem.type && (
                            <Badge variant="secondary">{selectedItem.type}</Badge>
                          )}
                          {selectedItem.version && (
                            <Badge variant="outline" className="font-mono">
                              {selectedItem.version_constraint || "^"}{selectedItem.version}
                            </Badge>
                          )}
                        </>
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
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium text-sm">
                                {child.code && <span className="text-muted-foreground mr-2">{child.code}</span>}
                                {child.name || child.title}
                              </div>
                              {child.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">{child.description}</p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resources */}
                  {selectedItem.id !== "overview" && selectedItem.itemType !== "standard_category" && (
                    <div className="mt-8">
                      <h3 className="text-lg font-semibold mb-4">Resources</h3>
                      <ResourceManager
                        entityType={selectedItem.itemType === "standard" ? "standard" : "tech_stack"}
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// Helper components for navigation
interface CategoryNavItemProps {
  category: StandardCategory & { standards: DocsItem[] };
  standards: DocsItem[];
  selectedId?: string;
  expandedIds: Set<string>;
  onSelect: (item: DocsItem) => void;
  onToggle: (id: string) => void;
}

function CategoryNavItem({ category, standards, selectedId, expandedIds, onSelect, onToggle }: CategoryNavItemProps) {
  const isExpanded = expandedIds.has(category.id);
  const hasChildren = standards.length > 0;

  const categoryItem: DocsItem = {
    id: category.id,
    name: category.name,
    description: category.description,
    long_description: category.long_description,
    itemType: "standard_category",
    children: standards,
  };

  return (
    <div>
      <button
        onClick={() => {
          onSelect(categoryItem);
          if (hasChildren) onToggle(category.id);
        }}
        className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-md text-sm transition-colors ${
          selectedId === category.id
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted"
        }`}
      >
        {hasChildren && (
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        )}
        <FolderTree className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="truncate font-medium">{category.name}</span>
      </button>
      {isExpanded && hasChildren && (
        <div className="ml-4 mt-1 space-y-1">
          {standards.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              level={1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              icon={<FileText className="h-4 w-4 text-blue-500" />}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface NavItemProps {
  item: DocsItem;
  level: number;
  selectedId?: string;
  expandedIds: Set<string>;
  onSelect: (item: DocsItem) => void;
  onToggle: (id: string) => void;
  icon: React.ReactNode;
}

function NavItem({ item, level, selectedId, expandedIds, onSelect, onToggle, icon }: NavItemProps) {
  const isExpanded = expandedIds.has(item.id);
  const hasChildren = item.children && item.children.length > 0;
  const displayName = item.name || item.title || "";

  return (
    <div>
      <button
        onClick={() => {
          onSelect(item);
          if (hasChildren) onToggle(item.id);
        }}
        className={`w-full flex items-center gap-2 text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
          selectedId === item.id
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted"
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
        {icon}
        <span className="truncate">
          {item.code && <span className="text-muted-foreground mr-1.5">{item.code}</span>}
          {displayName}
        </span>
      </button>
      {isExpanded && hasChildren && (
        <div className="mt-1 space-y-1">
          {item.children!.map((child) => (
            <NavItem
              key={child.id}
              item={child}
              level={level + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              icon={<FileText className="h-4 w-4 text-blue-500" />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
