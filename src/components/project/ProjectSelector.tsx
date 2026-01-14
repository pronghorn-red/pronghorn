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
  Loader2,
  FileCode,
  Database
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StandardsTreeSelector } from "@/components/standards/StandardsTreeSelector";
import { TechStackTreeSelector } from "@/components/techstack/TechStackTreeSelector";
import { RequirementsTreeSelector } from "./RequirementsTreeSelector";
import { ArtifactsListSelector } from "./ArtifactsListSelector";
import { ChatSessionsListSelector } from "./ChatSessionsListSelector";
import { CanvasItemsSelector } from "./CanvasItemsSelector";
import { RepositoryFilesSelector } from "./RepositoryFilesSelector";
import { DatabaseSchemaSelector } from "./DatabaseSchemaSelector";
import { useIsMobile } from "@/hooks/use-mobile";

export interface DatabaseSchemaItem {
  id: string; // UUID assigned when selected
  databaseId: string;
  databaseName: string;
  schemaName: string;
  type: 'table' | 'view' | 'function' | 'trigger' | 'index' | 'sequence' | 'type' | 'savedQuery' | 'migration';
  name: string;
  columns?: Array<{
    name: string;
    type: string;
    nullable: boolean;
    default?: string | null;
    maxLength?: number | null;
    isPrimaryKey?: boolean;
    isForeignKey?: boolean;
    foreignKeyRef?: string | null;
  }>;
  indexes?: Array<{
    name: string;
    definition: string;
  }>;
  definition?: string; // CREATE TABLE/VIEW/FUNCTION statement
  sampleData?: any[];
  // For saved queries
  sql_content?: string;
  description?: string;
  // For migrations
  sequence_number?: number;
  statement_type?: string;
  object_type?: string;
}

export interface FileItem {
  id: string; // UUID assigned when selected
  path: string;
  content: string;
}

export interface ChatMessageItem {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface ChatSessionItem {
  id: string;
  title: string | null;
  ai_title: string | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatMessageItem[];
}

export interface ProjectSelectionResult {
  projectMetadata: any | null;
  artifacts: any[];
  chatSessions: ChatSessionItem[];
  requirements: any[];
  standards: any[];
  techStacks: any[];
  canvasNodes: any[];
  canvasEdges: any[];
  canvasLayers: any[];
  files: FileItem[];
  databases: DatabaseSchemaItem[];
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
  | "canvas"
  | "files"
  | "databases";

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
  },
  {
    id: "files",
    label: "Repository Files",
    icon: <FileCode className="h-4 w-4" />,
    description: "Source code and project files"
  },
  {
    id: "databases",
    label: "Databases",
    icon: <Database className="h-4 w-4" />,
    description: "Database schemas, tables, and sample data"
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
    new Set((initialSelection?.chatSessions ?? []).map(c => typeof c === 'string' ? c : c.id))
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
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedDatabaseItems, setSelectedDatabaseItems] = useState<Set<string>>(new Set());
  const [includeSampleData, setIncludeSampleData] = useState(false);
  const [sampleDataRows, setSampleDataRows] = useState(5);

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

      if (!projectTechStacks || projectTechStacks.length === 0) {
        setTechStacks([]);
        setLinkedTechStackIds(new Set());
        return;
      }

      const linkedStackIds = projectTechStacks.map((pts: any) => pts.tech_stack_id as string);

      // Fetch all linked tech stack rows so we can determine which parents actually
      // have linked children for this project
      const { data: linkedStacks, error } = await supabase
        .from("tech_stacks")
        .select("id, parent_id, type")
        .in("id", linkedStackIds);

      if (error) {
        console.error("Error loading linked tech stacks:", error);
        setTechStacks([]);
        setLinkedTechStackIds(new Set());
        return;
      }

      // Parents that have at least one linked child (child has parent_id pointing to them)
      const parentIdsWithChildren = new Set<string>();
      (linkedStacks || []).forEach((stack) => {
        if (stack.parent_id) {
          parentIdsWithChildren.add(stack.parent_id as string);
        }
      });

      if (parentIdsWithChildren.size === 0) {
        // No parents with linked children – nothing to show in selector
        setTechStacks([]);
        setLinkedTechStackIds(new Set());
        return;
      }

      // Store all linked item IDs so the tree filters children to project-linked items only
      setLinkedTechStackIds(new Set(linkedStackIds));

      // Fetch only those parent tech stacks that actually have linked children
      const { data: parentStacks } = await supabase
        .from("tech_stacks")
        .select("*")
        .in("id", Array.from(parentIdsWithChildren))
        .order("order_index");

      setTechStacks(parentStacks || []);
    } catch (error) {
      console.error("Error loading tech stacks:", error);
      setTechStacks([]);
      setLinkedTechStackIds(new Set());
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

      // Fetch chat sessions with their full message history
      const chatSessions: ChatSessionItem[] = [];
      if (selectedChats.size > 0) {
        const { data: sessionsData, error } = await supabase.rpc("get_chat_sessions_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null
        });
        if (error) throw error;
        
        // Filter to selected sessions
        const selectedSessions = (sessionsData || []).filter((c: any) => selectedChats.has(c.id));
        
        // Fetch messages for each selected session in parallel
        const sessionsWithMessages = await Promise.all(
          selectedSessions.map(async (session: any) => {
            const { data: messagesData } = await supabase.rpc("get_chat_messages_with_token", {
              p_chat_session_id: session.id,
              p_token: shareToken || null
            });
            
            return {
              id: session.id,
              title: session.title,
              ai_title: session.ai_title,
              ai_summary: session.ai_summary,
              created_at: session.created_at,
              updated_at: session.updated_at,
              messages: (messagesData || []).map((msg: any) => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                created_at: msg.created_at
              }))
            };
          })
        );
        
        chatSessions.push(...sessionsWithMessages);
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

      // Fetch repository files content
      const files: FileItem[] = [];
      if (selectedFiles.size > 0) {
        // Get Prime repo
        const { data: repos } = await supabase.rpc("get_project_repos_with_token", {
          p_project_id: projectId,
          p_token: shareToken
        });
        const primeRepo = repos?.find((r: any) => r.is_prime) || repos?.[0];
        
        if (primeRepo) {
          // Get committed files
          const { data: committedFiles } = await supabase.rpc("get_project_files_with_token", {
            p_project_id: projectId,
            p_token: shareToken
          });

          // Get staged changes
          const { data: stagedChanges } = await supabase.rpc("get_staged_changes_with_token", {
            p_repo_id: primeRepo.id,
            p_token: shareToken
          });

          // Build effective content map (staged takes precedence)
          const fileContentMap = new Map<string, string>();
          
          (committedFiles || []).forEach((f: any) => {
            if (f.repo_id === primeRepo.id) {
              fileContentMap.set(f.path, f.content || '');
            }
          });

          (stagedChanges || []).forEach((s: any) => {
            if (s.operation_type === 'delete') {
              fileContentMap.delete(s.file_path);
            } else if (s.new_content !== null) {
              fileContentMap.set(s.file_path, s.new_content);
            }
          });

          // Add selected files to result
          for (const path of selectedFiles) {
            const content = fileContentMap.get(path);
            if (content !== undefined) {
              files.push({ id: crypto.randomUUID(), path, content });
            }
          }
        }
      }

      // Fetch database schema items
      const databases: DatabaseSchemaItem[] = [];
      if (selectedDatabaseItems.size > 0) {
        // Parse selected items and group by database
        const databaseGroups = new Map<string, { schemaName: string; type: string; name: string }[]>();
        
        for (const key of selectedDatabaseItems) {
          const parts = key.split(':');
          const databaseId = parts[0];
          const schemaName = parts[1];
          const type = parts[2];
          const name = parts.slice(3).join(':');
          
          if (!databaseGroups.has(databaseId)) {
            databaseGroups.set(databaseId, []);
          }
          databaseGroups.get(databaseId)!.push({ schemaName, type, name });
        }

        // Get both Render databases AND external connections
        const renderDbResult = await supabase.rpc("get_databases_with_token", {
          p_project_id: projectId,
          p_token: shareToken
        });

        let externalDbData: any[] = [];
        try {
          const externalDbResult = await supabase.rpc("get_db_connections_with_token", {
            p_project_id: projectId,
            p_token: shareToken
          });
          externalDbData = externalDbResult.data || [];
        } catch {
          // Owner-only, silently fail for non-owners
        }

        // Build combined map with source type
        const dbMap = new Map<string, { name: string; source: 'render' | 'external' }>();
        (renderDbResult.data || []).forEach((d: any) => dbMap.set(d.id, { name: d.name, source: 'render' }));
        externalDbData.forEach((d: any) => dbMap.set(d.id, { name: d.name, source: 'external' }));

        // Fetch saved queries and migrations for each database
        const savedQueriesMap = new Map<string, any[]>();
        const migrationsMap = new Map<string, any[]>();

        for (const databaseId of databaseGroups.keys()) {
          const dbInfo = dbMap.get(databaseId);
          if (!dbInfo) continue;
          
          const isExternal = dbInfo.source === 'external';
          
          if (isExternal) {
            // Use connection-based RPCs for external databases
            const [savedQueriesResult, migrationsResult] = await Promise.all([
              (supabase.rpc as any)('get_saved_queries_by_connection_with_token', { 
                p_connection_id: databaseId, 
                p_token: shareToken 
              }),
              (supabase.rpc as any)('get_migrations_by_connection_with_token', { 
                p_connection_id: databaseId, 
                p_token: shareToken 
              })
            ]);
            savedQueriesMap.set(databaseId, savedQueriesResult.data || []);
            migrationsMap.set(databaseId, migrationsResult.data || []);
          } else {
            // Use database-based RPCs for Render databases
            const [savedQueriesResult, migrationsResult] = await Promise.all([
              supabase.rpc('get_saved_queries_with_token', { p_database_id: databaseId, p_token: shareToken }),
              supabase.rpc('get_migrations_with_token', { p_database_id: databaseId, p_token: shareToken })
            ]);
            savedQueriesMap.set(databaseId, savedQueriesResult.data || []);
            migrationsMap.set(databaseId, migrationsResult.data || []);
          }
        }

        for (const [databaseId, items] of databaseGroups) {
          const dbInfo = dbMap.get(databaseId);
          if (!dbInfo) continue;

          const isExternal = dbInfo.source === 'external';
          // Build base request body with correct ID parameter based on source
          const getBaseBody = () => isExternal 
            ? { connectionId: databaseId, shareToken }
            : { databaseId, shareToken };

          for (const item of items) {
            const dbSchemaItem: DatabaseSchemaItem = {
              id: crypto.randomUUID(),
              databaseId,
              databaseName: dbInfo.name,
              schemaName: item.schemaName,
              type: item.type as DatabaseSchemaItem['type'],
              name: item.name
            };

            // Handle saved queries
            if (item.type === 'savedQuery') {
              const queries = savedQueriesMap.get(databaseId) || [];
              const query = queries.find((q: any) => q.id === item.name);
              if (query) {
                dbSchemaItem.name = query.name;
                dbSchemaItem.sql_content = query.sql_content;
                dbSchemaItem.description = query.description;
              }
              databases.push(dbSchemaItem);
              continue;
            }

            // Handle migrations
            if (item.type === 'migration') {
              const migrations = migrationsMap.get(databaseId) || [];
              const migration = migrations.find((m: any) => m.id === item.name);
              if (migration) {
                dbSchemaItem.name = migration.name || `${migration.sequence_number}_${migration.statement_type}`;
                dbSchemaItem.sql_content = migration.sql_content;
                dbSchemaItem.sequence_number = migration.sequence_number;
                dbSchemaItem.statement_type = migration.statement_type;
                dbSchemaItem.object_type = migration.object_type;
              }
              databases.push(dbSchemaItem);
              continue;
            }

            // Fetch full structure for tables (columns with defaults/PK/FK, indexes, CREATE statement)
            if (item.type === 'table') {
              try {
                const structureResponse = await supabase.functions.invoke('manage-database', {
                  body: {
                    ...getBaseBody(),
                    action: 'get_table_structure',
                    schema: item.schemaName,
                    table: item.name
                  }
                });
                if (structureResponse.data?.data) {
                  const data = structureResponse.data.data;
                  dbSchemaItem.columns = data.columns;
                  dbSchemaItem.indexes = data.indexes;
                  dbSchemaItem.definition = data.definition;
                }

                // Fetch sample data if enabled
                if (includeSampleData) {
                  const sampleResponse = await supabase.functions.invoke('manage-database', {
                    body: {
                      ...getBaseBody(),
                      action: 'get_table_data',
                      schema: item.schemaName,
                      table: item.name,
                      limit: sampleDataRows
                    }
                  });
                  if (sampleResponse.data?.data?.rows) {
                    dbSchemaItem.sampleData = sampleResponse.data.data.rows;
                  }
                }
              } catch (err) {
                console.error(`Error fetching structure for ${item.name}:`, err);
              }
            }

            // Fetch definition for views
            if (item.type === 'view') {
              try {
                const viewResponse = await supabase.functions.invoke('manage-database', {
                  body: {
                    ...getBaseBody(),
                    action: 'get_view_definition',
                    schema: item.schemaName,
                    name: item.name
                  }
                });
                if (viewResponse.data?.data?.definition) {
                  dbSchemaItem.definition = viewResponse.data.data.definition;
                }
              } catch (err) {
                console.error(`Error fetching view definition for ${item.name}:`, err);
              }
            }

            // Fetch definition for functions
            if (item.type === 'function') {
              try {
                const funcResponse = await supabase.functions.invoke('manage-database', {
                  body: {
                    ...getBaseBody(),
                    action: 'get_function_definition',
                    schema: item.schemaName,
                    name: item.name
                  }
                });
                if (funcResponse.data?.data?.definition) {
                  dbSchemaItem.definition = funcResponse.data.data.definition;
                }
              } catch (err) {
                console.error(`Error fetching function definition for ${item.name}:`, err);
              }
            }

            // Fetch definition for triggers
            if (item.type === 'trigger') {
              try {
                const triggerResponse = await supabase.functions.invoke('manage-database', {
                  body: {
                    ...getBaseBody(),
                    action: 'get_trigger_definition',
                    schema: item.schemaName,
                    name: item.name
                  }
                });
                if (triggerResponse.data?.data?.definition) {
                  dbSchemaItem.definition = triggerResponse.data.data.definition;
                }
              } catch (err) {
                console.error(`Error fetching trigger definition for ${item.name}:`, err);
              }
            }

            // Fetch definition for indexes
            if (item.type === 'index') {
              try {
                const indexResponse = await supabase.functions.invoke('manage-database', {
                  body: {
                    ...getBaseBody(),
                    action: 'get_index_definition',
                    schema: item.schemaName,
                    name: item.name
                  }
                });
                if (indexResponse.data?.data?.definition) {
                  dbSchemaItem.definition = indexResponse.data.data.definition;
                }
              } catch (err) {
                console.error(`Error fetching index definition for ${item.name}:`, err);
              }
            }

            // Fetch info for sequences
            if (item.type === 'sequence') {
              try {
                const seqResponse = await supabase.functions.invoke('manage-database', {
                  body: {
                    ...getBaseBody(),
                    action: 'get_sequence_info',
                    schema: item.schemaName,
                    name: item.name
                  }
                });
                if (seqResponse.data?.data?.definition) {
                  dbSchemaItem.definition = seqResponse.data.data.definition;
                }
              } catch (err) {
                console.error(`Error fetching sequence info for ${item.name}:`, err);
              }
            }

            // Fetch definition for types
            if (item.type === 'type') {
              try {
                const typeResponse = await supabase.functions.invoke('manage-database', {
                  body: {
                    ...getBaseBody(),
                    action: 'get_type_definition',
                    schema: item.schemaName,
                    name: item.name
                  }
                });
                if (typeResponse.data?.data?.definition) {
                  dbSchemaItem.definition = typeResponse.data.data.definition;
                }
              } catch (err) {
                console.error(`Error fetching type definition for ${item.name}:`, err);
              }
            }

            databases.push(dbSchemaItem);
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
        canvasLayers,
        files,
        databases
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
    setSelectedFiles(new Set());
    setSelectedDatabaseItems(new Set());
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
      selectedLayers.size +
      selectedFiles.size +
      selectedDatabaseItems.size
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

      case "files":
        return (
          <RepositoryFilesSelector
            projectId={projectId}
            shareToken={shareToken}
            selectedFiles={selectedFiles}
            onSelectionChange={setSelectedFiles}
          />
        );

      case "databases":
        return (
          <DatabaseSchemaSelector
            projectId={projectId}
            shareToken={shareToken}
            selectedDatabaseItems={selectedDatabaseItems}
            onSelectionChange={setSelectedDatabaseItems}
            includeSampleData={includeSampleData}
            onIncludeSampleDataChange={setIncludeSampleData}
            sampleDataRows={sampleDataRows}
            onSampleDataRowsChange={setSampleDataRows}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={isMobile ? "max-w-[100vw] w-full h-[100vh] p-0 m-0 flex flex-col" : "max-w-[100vw] max-h-[100vh] w-[100vw] h-[100vh] p-0 flex flex-col"}>
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
