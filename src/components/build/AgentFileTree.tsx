import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react";
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
  children?: FileNode[];
}

interface AgentFileTreeProps {
  files: Array<{ id: string; path: string; isStaged?: boolean }>;
  selectedFileId: string | null;
  onSelectFile: (fileId: string, path: string, isStaged?: boolean) => void;
  onAttachToPrompt: (fileId: string, path: string) => void;
  onReviewFile: (fileId: string, path: string) => void;
  onEditFile: (fileId: string, path: string) => void;
  onAuditFile: (fileId: string, path: string) => void;
}

export function AgentFileTree({
  files,
  selectedFileId,
  onSelectFile,
  onAttachToPrompt,
  onReviewFile,
  onEditFile,
  onAuditFile,
}: AgentFileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Build tree structure from flat file list
  const buildTree = (files: Array<{ id: string; path: string; isStaged?: boolean }>): FileNode[] => {
    const root: FileNode[] = [];
    const folderMap = new Map<string, FileNode>();

    files.forEach(({ id, path, isStaged }) => {
      const parts = path.split("/");
      let currentLevel = root;
      let currentPath = "";

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isFile = index === parts.length - 1;

        if (isFile) {
          currentLevel.push({
            id,
            name: part,
            path,
            type: "file",
            isStaged,
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

    return root;
  };

  const tree = buildTree(files);

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
      return (
        <div key={node.id}>
          <div
            className="flex items-center gap-1 px-2 py-1 hover:bg-accent cursor-pointer"
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => toggleFolder(node.path)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <Folder className="h-4 w-4 shrink-0 text-blue-400" />
            <span className="text-sm truncate">{node.name}</span>
          </div>
          {isExpanded && node.children?.map((child) => renderNode(child, level + 1))}
        </div>
      );
    }

    return (
      <ContextMenu key={node.id}>
        <ContextMenuTrigger>
          <div
            className={`flex items-center gap-1 px-2 py-1 hover:bg-accent cursor-pointer ${
              isSelected ? "bg-accent" : ""
            }`}
            style={{ paddingLeft: `${level * 12 + 20}px` }}
            onClick={() => onSelectFile(node.id, node.path, node.isStaged)}
          >
            <File className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm truncate">{node.name}</span>
            {node.isStaged && (
              <span className="text-xs text-green-500 ml-auto">staged</span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onAttachToPrompt(node.id, node.path)}>
            Attach to Prompt
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onReviewFile(node.id, node.path)}>
            Review File
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onEditFile(node.id, node.path)}>
            Edit File
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onAuditFile(node.id, node.path)}>
            Audit Against Requirements
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className="py-2">
        {tree.map((node) => renderNode(node))}
      </div>
    </ScrollArea>
  );
}
