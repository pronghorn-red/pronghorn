import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
}

interface FileTreeProps {
  files: FileNode[];
  onFileSelect?: (path: string) => void;
  selectedPath?: string;
}

function TreeNode({ 
  node, 
  level = 0, 
  onFileSelect, 
  selectedPath 
}: { 
  node: FileNode; 
  level?: number;
  onFileSelect?: (path: string) => void;
  selectedPath?: string;
}) {
  const [isOpen, setIsOpen] = useState(level === 0);
  const isSelected = selectedPath === node.path;

  if (node.type === "file") {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={`w-full justify-start font-normal ${isSelected ? 'bg-accent' : ''}`}
        style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
        onClick={() => onFileSelect?.(node.path)}
      >
        <File className="h-4 w-4 mr-2 shrink-0" />
        <span className="truncate">{node.name}</span>
      </Button>
    );
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start font-normal"
        style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 mr-1 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 mr-1 shrink-0" />
        )}
        {isOpen ? (
          <FolderOpen className="h-4 w-4 mr-2 shrink-0" />
        ) : (
          <Folder className="h-4 w-4 mr-2 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </Button>
      {isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ files, onFileSelect, selectedPath }: FileTreeProps) {
  return (
    <ScrollArea className="h-[600px] w-full">
      <div className="space-y-0.5">
        {files.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            onFileSelect={onFileSelect}
            selectedPath={selectedPath}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
