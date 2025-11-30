import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  MessageSquare, 
  ListTree, 
  BookOpen, 
  Layers, 
  Box, 
  Network, 
  Info,
  CheckSquare,
  Square,
  Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StandardsTreeSelector } from "@/components/standards/StandardsTreeSelector";
import { TechStackTreeSelector } from "@/components/techstack/TechStackTreeSelector";
import { RequirementsTreeSelector } from "./RequirementsTreeSelector";
import { ArtifactsListSelector } from "./ArtifactsListSelector";
import { ChatSessionsListSelector } from "./ChatSessionsListSelector";
import { CanvasItemsSelector } from "./CanvasItemsSelector";
import { useIsMobile } from "@/hooks/use-mobile";

export interface ProjectSelectionResult {
  projectMetadata: any | null;
  artifacts: any[];
  chatSessions: any[];
  requirements: any[];
  standards: any[];
  techStacks: any[];
  canvasNodes: any[];
  canvasEdges: any[];
  canvasLayers: any[];
}

interface ProjectSelectorProps {
  projectId: string;
  shareToken: string | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: ProjectSelectionResult) => void;
  initialSelection?: Partial<ProjectSelectionResult>;
}

type CategoryType = 
  | "metadata" 
  | "artifacts" 
  | "chats" 
  | "requirements" 
  | "standards" 
  | "techStacks" 
  | "canvas";

interface Category {
  id: CategoryType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const CATEGORIES: Category[] = [
  {
    id: "metadata",
    label: "Project Info",
    icon: <Info className="h-4 w-4" />,
    description: "Project metadata and settings"
  },
  {
    id: "artifacts",
    label: "Artifacts",
    icon: <FileText className="h-4 w-4" />,
    description: "Reusable text blocks and documents"
  },
  {
    id: "chats",
    label: "Chat Sessions",
    icon: <MessageSquare className="h-4 w-4" />,
    description: "Previous chat conversations"
  },
  {
    id: "requirements",
    label: "Requirements",
    icon: <ListTree className="h-4 w-4" />,
    description: "Project requirements hierarchy"
  },
  {
    id: "standards",
    label: "Standards",
    icon: <BookOpen className="h-4 w-4" />,
    description: "Linked standards and compliance"
  },
  {
    id: "techStacks",
    label: "Tech Stacks",
    icon: <Layers className="h-4 w-4" />,
    description: "Technology stack components"
  },
  {
    id: "canvas",
    label: "Canvas",
    icon: <Network className="h-4 w-4" />,
    description: "Architecture nodes, edges, layers"
  }
];

export function ProjectSelector({
  projectId,
  shareToken,
  open,
  onClose,
  onConfirm,
  initialSelection
}: ProjectSelectorProps) {
  const isMobile = useIsMobile();
  const [activeCategory, setActiveCategory] = useState<CategoryType>("metadata");
  const [includeMetadata, setIncludeMetadata] = useState(initialSelection?.projectMetadata ? true : false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [selectedArtifacts, setSelectedArtifacts] = useState<Set<string>>(
    new Set(initialSelection?.artifacts ?? [])
  );
  const [selectedChats, setSelectedChats] = useState<Set<string>>(
    new Set(initialSelection?.chatSessions ?? [])
  );
  const [selectedRequirements, setSelectedRequirements] = useState<Set<string>>(
    new Set(initialSelection?.requirements ?? [])
  );
  const [selectedStandards, setSelectedStandards] = useState<Set<string>>(
    new Set(initialSelection?.standards ?? [])
  );
  const [selectedTechStacks, setSelectedTechStacks] = useState<Set<string>>(
    new Set(initialSelection?.techStacks ?? [])
  );
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(
    new Set(initialSelection?.canvasNodes ?? [])
  );
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(
    new Set(initialSelection?.canvasEdges ?? [])
  );
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(
    new Set(initialSelection?.canvasLayers ?? [])
  );

  // Load project-linked standards & tech stacks
  const [standardCategories, setStandardCategories] = useState<any[]>([]);
  const [techStacks, setTechStacks] = useState<any[]>([]);
  const [linkedTechStackIds, setLinkedTechStackIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && projectId) {
      loadProjectStandards();
      loadProjectTechStacks();
    }
  }, [open, projectId]);

  const loadProjectStandards = async () => {
    try {
      // Get project-linked standard IDs
      const { data: projectStandards } = await supabase.rpc(
        "get_project_standards_with_token",
        {
          p_project_id: projectId,
          p_token: shareToken
        }
      );

      if (!projectStandards) return;

      const linkedStandardIds = projectStandards.map((ps: any) => ps.standard_id);

      // Get all categories
      const { data: categoriesData } = await supabase
        .from("standard_categories")
        .select("*")
        .order("order_index");

      // Get all standards
      const { data: standardsData } = await supabase
        .from("standards")
        .select("*")
        .in("id", linkedStandardIds)
        .order("order_index");

      const buildHierarchy = (flatStandards: any[]) => {
        const map = new Map();
        const roots: any[] = [];

        flatStandards.forEach((std) => {
          map.set(std.id, { ...std, children: [] });
        });

        flatStandards.forEach((std) => {
          const node = map.get(std.id);
          if (std.parent_id && map.has(std.parent_id)) {
            map.get(std.parent_id).children.push(node);
          } else {
            roots.push(node);
          }
        });

        return roots;
      };

      const categories = (categoriesData || [])
        .map((cat) => ({
          ...cat,
          standards: buildHierarchy(
            (standardsData || []).filter((s) => s.category_id === cat.id)
          )
        }))
        .filter((cat) => cat.standards.length > 0);

      setStandardCategories(categories);
    } catch (error) {
      console.error("Error loading standards:", error);
    }
  };

  const loadProjectTechStacks = async () => {
    try {
      // Get project-linked tech stack IDs (includes both parents and children)
      const { data: projectTechStacks } = await supabase.rpc(
        "get_project_tech_stacks_with_token",
        {
          p_project_id: projectId,
          p_token: shareToken
        }
      );

      if (!projectTechStacks) return;

      const linkedStackIds = projectTechStacks.map((pts: any) => pts.tech_stack_id);

      // Store all linked tech stack item IDs so the tree can filter to project-linked items only
      setLinkedTechStackIds(new Set(linkedStackIds));

      // Fetch all linked tech stack items to find their parents
      const { data: linkedItems } = await supabase
        .from("tech_stacks")
        .select("*")
        .in("id", linkedStackIds);

      if (!linkedItems || linkedItems.length === 0) {
        setTechStacks([]);
        return;
      }

      // Find unique parent IDs from linked items
      const parentIds = new Set<string>();
      linkedItems.forEach((item) => {
        if (item.parent_id && item.type !== null) {
          // This is a child item, find its ultimate parent
          const findRootParent = (currentItem: any): string | null => {
            if (!currentItem.parent_id) return currentItem.id;
            const parent = linkedItems.find(i => i.id === currentItem.parent_id);
            return parent ? findRootParent(parent) : currentItem.parent_id;
          };
          const rootId = findRootParent(item);
          if (rootId) parentIds.add(rootId);
        } else if (!item.parent_id && item.type === null) {
          // This is already a parent
          parentIds.add(item.id);
        }
      });

      // Fetch only those parent tech stacks
      const { data: parentStacks } = await supabase
        .from("tech_stacks")
        .select("*")
        .in("id", Array.from(parentIds))
        .order("order_index");

      setTechStacks(parentStacks || []);
    } catch (error) {
      console.error("Error loading tech stacks:", error);
    }
  };

  const handleConfirm = async () => {
    setIsLoadingContent(true);
    
    try {
      // Fetch project metadata if selected
      let projectMetadata = null;
      if (includeMetadata) {
        const { data, error } = await supabase.rpc("get_project_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null
        });
        if (error) throw error;
        projectMetadata = data;
      }

      // Fetch artifacts
      const artifacts = [];
      if (selectedArtifacts.size > 0) {
        const { data, error } = await supabase.rpc("get_artifacts_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null
        });
        if (error) throw error;
        artifacts.push(...(data || []).filter((a: any) => selectedArtifacts.has(a.id)));
      }

      // Fetch chat sessions
      const chatSessions = [];
      if (selectedChats.size > 0) {
        const { data, error } = await supabase.rpc("get_chat_sessions_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null
        });
        if (error) throw error;
        chatSessions.push(...(data || []).filter((c: any) => selectedChats.has(c.id)));
      }

      // Fetch requirements
      const requirements = [];
      if (selectedRequirements.size > 0) {
        const { data, error } = await supabase.rpc("get_requirements_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null
        });
        if (error) throw error;
        requirements.push(...(data || []).filter((r: any) => selectedRequirements.has(r.id)));
      }

      // Fetch standards
      const standards = [];
      if (selectedStandards.size > 0) {
        const { data: standardsData } = await supabase
          .from("standards")
          .select("*")
          .in("id", Array.from(selectedStandards));
        
        standards.push(...(standardsData || []));
      }

      // Fetch tech stacks - tech stack items are now separate rows
      const techStacksData = [];
      if (selectedTechStacks.size > 0) {
        const { data: tsData } = await supabase
          .from("tech_stacks")
          .select("*")
          .in("id", Array.from(selectedTechStacks));
        
        techStacksData.push(...(tsData || []));
      }

      // Fetch canvas nodes
      const canvasNodes = [];
      if (selectedNodes.size > 0) {
        const { data, error } = await supabase.rpc("get_canvas_nodes_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null
        });
        if (error) throw error;
        canvasNodes.push(...(data || []).filter((n: any) => selectedNodes.has(n.id)));
      }

      // Fetch canvas edges
      const canvasEdges = [];
      if (selectedEdges.size > 0) {
        const { data, error } = await supabase.rpc("get_canvas_edges_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null
        });
        if (error) throw error;
        canvasEdges.push(...(data || []).filter((e: any) => selectedEdges.has(e.id)));
      }

      // Fetch canvas layers
      const canvasLayers = [];
      if (selectedLayers.size > 0) {
        const { data, error } = await supabase.rpc("get_canvas_layers_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null
        });
        if (error) throw error;
        const filteredLayers = (data || []).filter((l: any) => selectedLayers.has(l.id));
        canvasLayers.push(...filteredLayers);
        
        // Also include nodes from selected layers (if not already included)
        const layerNodeIds = new Set<string>();
        filteredLayers.forEach((layer: any) => {
          layer.node_ids?.forEach((nodeId: string) => layerNodeIds.add(nodeId));
        });
        
        // Add any layer nodes that weren't already selected
        if (layerNodeIds.size > 0 && canvasNodes.length > 0) {
          const allNodesData = await supabase.rpc("get_canvas_nodes_with_token", {
            p_project_id: projectId,
            p_token: shareToken || null
          });
          if (allNodesData.data) {
            const additionalNodes = (allNodesData.data || []).filter(
              (n: any) => layerNodeIds.has(n.id) && !canvasNodes.some(cn => cn.id === n.id)
            );
            canvasNodes.push(...additionalNodes);
          }
        } else if (layerNodeIds.size > 0 && canvasNodes.length === 0) {
          // If no nodes were selected initially, fetch all layer nodes
          const allNodesData = await supabase.rpc("get_canvas_nodes_with_token", {
            p_project_id: projectId,
            p_token: shareToken || null
          });
          if (allNodesData.data) {
            const layerNodes = (allNodesData.data || []).filter((n: any) => layerNodeIds.has(n.id));
            canvasNodes.push(...layerNodes);
          }
        }
      }

      const result: ProjectSelectionResult = {
        projectMetadata,
        artifacts,
        chatSessions,
        requirements,
        standards,
        techStacks: techStacksData,
        canvasNodes,
        canvasEdges,
        canvasLayers
      };

      onConfirm(result);
      onClose();
      toast.success("Content retrieved successfully");
    } catch (error) {
      console.error("Error retrieving content:", error);
      toast.error("Failed to retrieve content");
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleSelectAll = () => {
    // Select all items in all categories
    setIncludeMetadata(true);
    // Artifacts, chats, requirements, nodes, edges, layers will be selected via their respective "Select All" in each view
    toast.info("Use category-specific Select All buttons");
  };

  const handleSelectNone = () => {
    setIncludeMetadata(false);
    setSelectedArtifacts(new Set());
    setSelectedChats(new Set());
    setSelectedRequirements(new Set());
    setSelectedStandards(new Set());
    setSelectedTechStacks(new Set());
    setSelectedNodes(new Set());
    setSelectedEdges(new Set());
    setSelectedLayers(new Set());
  };

  const getTotalSelected = () => {
    return (
      (includeMetadata ? 1 : 0) +
      selectedArtifacts.size +
      selectedChats.size +
      selectedRequirements.size +
      selectedStandards.size +
      selectedTechStacks.size +
      selectedNodes.size +
      selectedEdges.size +
      selectedLayers.size
    );
  };

  const renderCategoryContent = () => {
    switch (activeCategory) {
      case "metadata":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Include project name, description, organization, budget, scope, timeline, and other metadata.
            </p>
            <Button
              variant={includeMetadata ? "default" : "outline"}
              onClick={() => setIncludeMetadata(!includeMetadata)}
              className="w-full"
            >
              {includeMetadata ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
              {includeMetadata ? "Project Metadata Included" : "Include Project Metadata"}
            </Button>
          </div>
        );

      case "artifacts":
        return (
          <ArtifactsListSelector
            projectId={projectId}
            shareToken={shareToken}
            selectedArtifacts={selectedArtifacts}
            onSelectionChange={setSelectedArtifacts}
          />
        );

      case "chats":
        return (
          <ChatSessionsListSelector
            projectId={projectId}
            shareToken={shareToken}
            selectedChats={selectedChats}
            onSelectionChange={setSelectedChats}
          />
        );

      case "requirements":
        return (
          <RequirementsTreeSelector
            projectId={projectId}
            shareToken={shareToken}
            selectedRequirements={selectedRequirements}
            onSelectionChange={setSelectedRequirements}
          />
        );

      case "standards":
        return standardCategories.length > 0 ? (
          <StandardsTreeSelector
            categories={standardCategories}
            selectedStandards={selectedStandards}
            onSelectionChange={setSelectedStandards}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No standards linked to this project.</p>
        );

      case "techStacks":
        return techStacks.length > 0 ? (
          <TechStackTreeSelector
            techStacks={techStacks}
            selectedItems={selectedTechStacks}
            onSelectionChange={setSelectedTechStacks}
            allowedItemIds={linkedTechStackIds}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No tech stacks linked to this project.</p>
        );

      case "canvas":
        return (
          <CanvasItemsSelector
            projectId={projectId}
            shareToken={shareToken}
            selectedNodes={selectedNodes}
            selectedEdges={selectedEdges}
            selectedLayers={selectedLayers}
            onNodesChange={setSelectedNodes}
            onEdgesChange={setSelectedEdges}
            onLayersChange={setSelectedLayers}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={isMobile ? "max-w-[95vw] w-full h-[90vh] p-0 m-0 flex flex-col" : "max-w-5xl max-h-[80vh] p-0 flex flex-col"}>
        <DialogHeader className="px-3 md:px-6 pt-3 md:pt-6 pb-2 md:pb-4 shrink-0">
          <DialogTitle className="text-base md:text-lg">Select Project Elements</DialogTitle>
          <DialogDescription className="text-xs md:text-sm">
            Choose any elements from your project to include
          </DialogDescription>
        </DialogHeader>

        {isMobile ? (
          /* Mobile Layout - Tabs at top */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Horizontal scrollable category tabs */}
            <div className="border-b shrink-0 overflow-x-auto">
              <div className="flex gap-1 px-3 py-2 min-w-max">
                {CATEGORIES.map((category) => (
                  <Button
                    key={category.id}
                    variant={activeCategory === category.id ? "default" : "outline"}
                    size="sm"
                    className="whitespace-nowrap text-xs"
                    onClick={() => setActiveCategory(category.id)}
                  >
                    {category.icon}
                    <span className="ml-1.5">{category.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-3 py-2 border-b shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm truncate">
                      {CATEGORIES.find(c => c.id === activeCategory)?.label}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {CATEGORIES.find(c => c.id === activeCategory)?.description}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {getTotalSelected()}
                  </Badge>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
                {renderCategoryContent()}
              </div>
            </div>
          </div>
        ) : (
          /* Desktop Layout - Sidebar */
          <div className="flex-1 flex min-h-0">
            {/* Left sidebar - Categories */}
            <div className="w-56 border-r bg-muted/20 p-4 shrink-0">
              <div className="h-full overflow-y-auto">
                <div className="space-y-1">
                  {CATEGORIES.map((category) => (
                    <Button
                      key={category.id}
                      variant={activeCategory === category.id ? "secondary" : "ghost"}
                      className="w-full justify-start text-sm"
                      onClick={() => setActiveCategory(category.id)}
                    >
                      {category.icon}
                      <span className="ml-2">{category.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right content area */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-6 py-4 border-b shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">
                      {CATEGORIES.find(c => c.id === activeCategory)?.label}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {CATEGORIES.find(c => c.id === activeCategory)?.description}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {getTotalSelected()} selected
                  </Badge>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                {renderCategoryContent()}
              </div>
            </div>
          </div>
        )}

        <Separator className="shrink-0" />

        <DialogFooter className="px-3 md:px-6 py-2 md:py-4 shrink-0">
          <div className={isMobile ? "flex flex-col gap-2 w-full" : "flex items-center justify-between w-full"}>
            {isMobile ? (
              <>
                <Button onClick={handleConfirm} disabled={isLoadingContent} className="w-full text-sm" size="sm">
                  {isLoadingContent ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Retrieving...
                    </>
                  ) : (
                    `Add Selected (${getTotalSelected()})`
                  )}
                </Button>
                <div className="flex gap-2 w-full">
                  <Button variant="outline" size="sm" onClick={handleSelectNone} className="flex-1 text-xs">
                    Clear All
                  </Button>
                  <Button variant="outline" size="sm" onClick={onClose} disabled={isLoadingContent} className="flex-1 text-xs">
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleSelectNone}>
                    Clear All
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose} disabled={isLoadingContent}>
                    Cancel
                  </Button>
                  <Button onClick={handleConfirm} disabled={isLoadingContent}>
                    {isLoadingContent ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Retrieving Content...
                      </>
                    ) : (
                      `Add Selected (${getTotalSelected()})`
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
