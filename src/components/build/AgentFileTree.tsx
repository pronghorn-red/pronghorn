import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface FileNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "folder";
  isStaged?: boolean;
  operationType?: "add" | "edit" | "delete" | "rename";
  children?: FileNode[];
}

interface AgentFileTreeProps {
  files: Array<{ id: string; path: string; isStaged?: boolean }>;
  stagedChanges?: Array<{ 
    file_path: string; 
    operation_type: string;
    old_path?: string;
  }>;
  selectedFileId: string | null;
  onSelectFile: (fileId: string, path: string, isStaged?: boolean) => void;
  onAttachToPrompt: (fileId: string, path: string) => void;
  onReviewFile: (fileId: string, path: string) => void;
  onEditFile: (fileId: string, path: string) => void;
  onAuditFile: (fileId: string, path: string) => void;
}

export function AgentFileTree({
  files,
  stagedChanges = [],
  selectedFileId,
  onSelectFile,
  onAttachToPrompt,
  onReviewFile,
  onEditFile,
  onAuditFile,
}: AgentFileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Build tree structure from flat file list with operation types
  const tree = useMemo(() => {
    const root: FileNode[] = [];
    const folderMap = new Map<string, FileNode>();
    const stagedMap = new Map(stagedChanges.map((s) => [s.file_path, s.operation_type]));

    files.forEach(({ id, path, isStaged }) => {
      const parts = path.split("/");
      let currentLevel = root;
      let currentPath = "";

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isFile = index === parts.length - 1;

        if (isFile) {
          const operationType = stagedMap.get(path) as "add" | "edit" | "delete" | "rename" | undefined;
          currentLevel.push({
            id,
            name: part,
            path,
            type: "file",
            isStaged,
            operationType,
          });
        } else {
          let folder = folderMap.get(currentPath);
          if (!folder) {
            folder = {
              id: currentPath,
              name: part,
              path: currentPath,
              type: "folder",
              children: [],
            };
            folderMap.set(currentPath, folder);
            currentLevel.push(folder);
          }
          currentLevel = folder.children!;
        }
      });
    });

    // Sort function: folders first alphabetically, then files alphabetically
    const sortNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.sort((a, b) => {
        if (a.type === "folder" && b.type === "file") return -1;
        if (a.type === "file" && b.type === "folder") return 1;
        return a.name.localeCompare(b.name);
      }).map(node => {
        if (node.children) {
          return { ...node, children: sortNodes(node.children) };
        }
        return node;
      });
    };

    return sortNodes(root);
  }, [files, stagedChanges]);

  // Determine folder color based on children
  const getFolderColor = (node: FileNode): string => {
    if (!node.children) return "";

    const colors = new Set<string>();
    const collectColors = (nodes: FileNode[]) => {
      nodes.forEach((child) => {
        if (child.type === "file" && child.operationType) {
          if (child.operationType === "delete") colors.add("red");
          else if (child.operationType === "edit" || child.operationType === "rename") colors.add("yellow");
          else if (child.operationType === "add") colors.add("green");
        }
        if (child.children) collectColors(child.children);
      });
    };

    collectColors(node.children);
    
    if (colors.size === 0) return "";
    if (colors.size > 1) return "bg-[#3e3e42]"; // Grey for mixed
    if (colors.has("red")) return "bg-red-500/20";
    if (colors.has("yellow")) return "bg-yellow-500/20";
    if (colors.has("green")) return "bg-green-500/20";
    return "";
  };

  const getFileColor = (operationType?: string): string => {
    if (!operationType) return "text-[#cccccc]";
    if (operationType === "delete") return "text-red-400";
    if (operationType === "edit" || operationType === "rename") return "text-yellow-400";
    if (operationType === "add") return "text-green-400";
    return "text-[#cccccc]";
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (node: FileNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFileId === node.id;

    if (node.type === "folder") {
      const folderBgColor = getFolderColor(node);
      
      return (
        <div key={node.id}>
          <div
            className={`flex items-center gap-1 px-2 py-1 hover:bg-[#2a2d2e] cursor-pointer transition-colors ${folderBgColor}`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => toggleFolder(node.path)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#858585]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#858585]" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-[#dcb67a]" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-[#dcb67a]" />
            )}
            <span className="text-sm truncate text-[#cccccc] font-medium">{node.name}</span>
          </div>
          {isExpanded && node.children?.map((child) => renderNode(child, level + 1))}
        </div>
      );
    }

    return (
      <ContextMenu key={node.id}>
        <ContextMenuTrigger>
          <div
            className={`flex items-center gap-1 px-2 py-1 hover:bg-[#2a2d2e] cursor-pointer transition-colors ${
              isSelected ? "bg-[#37373d]" : ""
            }`}
            style={{ paddingLeft: `${level * 12 + 20}px` }}
            onClick={() => onSelectFile(node.id, node.path, node.isStaged)}
          >
            <File className={`h-4 w-4 shrink-0 ${getFileColor(node.operationType)} ${
              node.operationType === "delete" ? "opacity-60" : ""
            }`} />
            <span className={`text-sm truncate ${getFileColor(node.operationType)} ${
              node.operationType === "delete" ? "line-through opacity-60" : ""
            }`}>
              {node.name}
            </span>
            {node.isStaged && (
              <span className={`text-xs ml-auto ${
                node.operationType === "delete" ? "text-red-400" : "text-green-400"
              }`}>
                {node.operationType === "delete" ? "deleting" : "staged"}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-[#252526] border-[#3e3e42]">
          <ContextMenuItem 
            onClick={() => onAttachToPrompt(node.id, node.path)}
            className="text-[#cccccc] focus:bg-[#2a2d2e] focus:text-[#ffffff]"
          >
            Attach to Prompt
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-[#3e3e42]" />
          <ContextMenuItem 
            onClick={() => onReviewFile(node.id, node.path)}
            className="text-[#cccccc] focus:bg-[#2a2d2e] focus:text-[#ffffff]"
          >
            Review File
          </ContextMenuItem>
          <ContextMenuItem 
            onClick={() => onEditFile(node.id, node.path)}
            className="text-[#cccccc] focus:bg-[#2a2d2e] focus:text-[#ffffff]"
          >
            Edit File
          </ContextMenuItem>
          <ContextMenuItem 
            onClick={() => onAuditFile(node.id, node.path)}
            className="text-[#cccccc] focus:bg-[#2a2d2e] focus:text-[#ffffff]"
          >
            Audit Against Requirements
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="py-2">
          {tree.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-[#858585]">No files yet</p>
            </div>
          ) : (
            tree.map((node) => renderNode(node))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
