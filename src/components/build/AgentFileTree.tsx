import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Edit, Trash2, Paperclip, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

// Size thresholds for file warnings
const SIZE_WARN_THRESHOLD = 1 * 1024 * 1024; // 1 MB - show yellow badge
const SIZE_DANGER_THRESHOLD = 5 * 1024 * 1024; // 5 MB - show red badge
const SIZE_BLOCK_THRESHOLD = 10 * 1024 * 1024; // 10 MB - show warning icon

interface FileNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "folder";
  isStaged?: boolean;
  operationType?: "add" | "edit" | "delete" | "rename";
  contentLength?: number;
  isBinary?: boolean;
  children?: FileNode[];
}

interface AgentFileTreeProps {
  files: Array<{ id: string; path: string; isStaged?: boolean; contentLength?: number; isBinary?: boolean }>;
  stagedChanges?: Array<{ 
    file_path: string; 
    operation_type: string;
    old_path?: string;
  }>;
  selectedFilePath: string | null;
  onSelectFile: (fileId: string, path: string, isStaged?: boolean, contentLength?: number, isBinary?: boolean) => void;
  onFolderSelect: (folderPath: string) => void;
  onAttachToPrompt: (fileId: string, path: string) => void;
  onRenameFile: (fileId: string, path: string) => void;
  onDeleteFile: (fileId: string, path: string) => void;
}

// Format file size for display
function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AgentFileTree({
  files,
  stagedChanges = [],
  selectedFilePath,
  onSelectFile,
  onFolderSelect,
  onAttachToPrompt,
  onRenameFile,
  onDeleteFile,
}: AgentFileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Build tree structure from flat file list with operation types and size info
  const tree = useMemo(() => {
    const root: FileNode[] = [];
    const folderMap = new Map<string, FileNode>();
    const stagedMap = new Map(stagedChanges.map((s) => [s.file_path, s.operation_type]));

    files.forEach(({ id, path, isStaged, contentLength, isBinary }) => {
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
            contentLength,
            isBinary,
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

  const handleFolderClick = (path: string) => {
    // Toggle expansion
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    // Set as selected folder for creating new files
    onFolderSelect(path);
  };

  const renderNode = (node: FileNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFilePath === node.path;

    if (node.type === "folder") {
      const folderBgColor = getFolderColor(node);
      
      return (
        <ContextMenu key={node.id}>
          <ContextMenuTrigger>
            <div
              className={`flex items-center gap-1 px-2 py-1 hover:bg-[#2a2d2e] cursor-pointer transition-colors ${folderBgColor}`}
              style={{ paddingLeft: `${level * 12 + 8}px` }}
              onClick={() => handleFolderClick(node.path)}
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
          </ContextMenuTrigger>
          <ContextMenuContent className="bg-[#252526] border-[#3e3e42]">
            <ContextMenuItem 
              onClick={() => onRenameFile(node.id, node.path)}
              className="text-[#cccccc] focus:bg-[#2a2d2e] focus:text-[#ffffff]"
            >
              <Edit className="h-4 w-4 mr-2" />
              Rename
            </ContextMenuItem>
            <ContextMenuItem 
              onClick={() => onDeleteFile(node.id, node.path)}
              className="text-red-400 focus:bg-[#2a2d2e] focus:text-red-300"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
          {isExpanded && node.children?.map((child) => renderNode(child, level + 1))}
        </ContextMenu>
      );
    }

    // Determine size badge styling
    const size = node.contentLength || 0;
    const isLargeFile = size >= SIZE_WARN_THRESHOLD;
    const isDangerSize = size >= SIZE_DANGER_THRESHOLD;
    const isBlockedSize = size >= SIZE_BLOCK_THRESHOLD;
    const isNonImageBinary = node.isBinary && !node.name.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|bmp)$/i);

    return (
      <ContextMenu key={node.id}>
        <ContextMenuTrigger>
          <div
            className={`flex items-center gap-1 px-2 py-1 hover:bg-[#2a2d2e] cursor-pointer transition-colors ${
              isSelected ? "bg-[#37373d]" : ""
            }`}
            style={{ paddingLeft: `${level * 12 + 20}px` }}
            onClick={() => onSelectFile(node.id, node.path, node.isStaged, node.contentLength, node.isBinary)}
          >
            <File className={`h-4 w-4 shrink-0 ${getFileColor(node.operationType)} ${
              node.operationType === "delete" ? "opacity-60" : ""
            }`} />
            <span className={`text-sm truncate flex-1 ${getFileColor(node.operationType)} ${
              node.operationType === "delete" ? "line-through opacity-60" : ""
            }`}>
              {node.name}
            </span>
            
            {/* Size badge for large files */}
            {isLargeFile && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] px-1 py-0 h-4 shrink-0 ${
                        isDangerSize 
                          ? "border-red-500/50 text-red-400 bg-red-500/10" 
                          : "border-yellow-500/50 text-yellow-400 bg-yellow-500/10"
                      }`}
                    >
                      {formatFileSize(size)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isBlockedSize ? "File too large to edit in browser" : isDangerSize ? "Large file - may be slow to load" : "File over 1 MB"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {/* Warning icon for blocked files */}
            {(isBlockedSize || (isNonImageBinary && size > SIZE_WARN_THRESHOLD)) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isNonImageBinary ? "Binary file - download to view" : "Too large for browser editing"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {node.isStaged && !isLargeFile && (
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
            <Paperclip className="h-4 w-4 mr-2" />
            Attach to Prompt
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-[#3e3e42]" />
          <ContextMenuItem 
            onClick={() => onRenameFile(node.id, node.path)}
            className="text-[#cccccc] focus:bg-[#2a2d2e] focus:text-[#ffffff]"
          >
            <Edit className="h-4 w-4 mr-2" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem 
            onClick={() => onDeleteFile(node.id, node.path)}
            className="text-red-400 focus:bg-[#2a2d2e] focus:text-red-300"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
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
