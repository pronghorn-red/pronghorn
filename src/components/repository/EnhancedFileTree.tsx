import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, FilePlus, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileTreeContextMenu } from "./FileTreeContextMenu";
import { CreateFileDialog } from "./CreateFileDialog";
import { RenameDialog } from "./RenameDialog";
import { FileTreeSearch } from "./FileTreeSearch";
import { ContentSearchDialog } from "./ContentSearchDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
}

interface EnhancedFileTreeProps {
  files: FileNode[];
  onFileSelect?: (path: string) => void;
  selectedPath?: string;
  onFileCreate: (path: string, isFolder: boolean) => void;
  onFileRename: (oldPath: string, newPath: string) => void;
  onFileDelete: (path: string) => void;
  allFilesWithContent?: { path: string; content: string }[];
}

function TreeNode({ 
  node, 
  level = 0, 
  onFileSelect, 
  selectedPath,
  onFileCreate,
  onFileRename,
  onFileDelete,
}: { 
  node: FileNode; 
  level?: number;
  onFileSelect?: (path: string) => void;
  selectedPath?: string;
  onFileCreate: (path: string, isFolder: boolean) => void;
  onFileRename: (oldPath: string, newPath: string) => void;
  onFileDelete: (path: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(level < 2);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createType, setCreateType] = useState<"file" | "folder">("file");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Hide .gitkeep files from the tree
  if (node.type === "file" && node.name === ".gitkeep") {
    return null;
  }
  
  const isSelected = selectedPath === node.path;

  const handleNewFile = () => {
    setCreateType("file");
    setCreateDialogOpen(true);
  };

  const handleNewFolder = () => {
    setCreateType("folder");
    setCreateDialogOpen(true);
  };

  const handleCreate = (name: string) => {
    const basePath = node.type === "folder" ? node.path : node.path.split("/").slice(0, -1).join("/");
    const newPath = basePath ? `${basePath}/${name}` : name;
    onFileCreate(newPath, createType === "folder");
  };

  const handleRename = (newName: string) => {
    const pathParts = node.path.split("/");
    pathParts[pathParts.length - 1] = newName;
    const newPath = pathParts.join("/");
    onFileRename(node.path, newPath);
  };

  const handleDelete = () => {
    onFileDelete(node.path);
  };

  if (node.type === "file") {
    return (
      <>
        <FileTreeContextMenu
          type="file"
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={() => setRenameDialogOpen(true)}
          onDelete={() => setDeleteDialogOpen(true)}
        >
          <button
            className={`w-full text-left px-2 py-1 text-sm hover:bg-[#2a2d2e] transition-colors flex items-center gap-2 ${
              isSelected ? 'bg-[#37373d] text-[#ffffff]' : 'text-[#cccccc]'
            }`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => onFileSelect?.(node.path)}
          >
            <File className="h-4 w-4 shrink-0 text-[#858585]" />
            <span className="truncate text-sm">{node.name}</span>
          </button>
        </FileTreeContextMenu>
        <CreateFileDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          type={createType}
          basePath={node.path.split("/").slice(0, -1).join("/")}
          onConfirm={handleCreate}
        />
        <RenameDialog
          open={renameDialogOpen}
          onOpenChange={setRenameDialogOpen}
          currentName={node.name}
          type="file"
          onConfirm={handleRename}
        />
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete File</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{node.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <div>
      <FileTreeContextMenu
        type="folder"
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onRename={() => setRenameDialogOpen(true)}
        onDelete={() => setDeleteDialogOpen(true)}
      >
        <button
          className="w-full text-left px-2 py-1 text-sm hover:bg-[#2a2d2e] transition-colors flex items-center gap-1 text-[#cccccc]"
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#858585]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#858585]" />
          )}
          {isOpen ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-[#dcb67a]" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-[#dcb67a]" />
          )}
          <span className="truncate text-sm font-medium">{node.name}</span>
        </button>
      </FileTreeContextMenu>
      {isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
              onFileCreate={onFileCreate}
              onFileRename={onFileRename}
              onFileDelete={onFileDelete}
            />
          ))}
        </div>
      )}
      <CreateFileDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        type={createType}
        basePath={node.path}
        onConfirm={handleCreate}
      />
      <RenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        currentName={node.name}
        type="folder"
        onConfirm={handleRename}
      />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{node.name}" and all its contents? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function EnhancedFileTree({ files, onFileSelect, selectedPath, onFileCreate, onFileRename, onFileDelete, allFilesWithContent = [] }: EnhancedFileTreeProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createType, setCreateType] = useState<"file" | "folder">("file");
  const [fileNameFilter, setFileNameFilter] = useState("");
  const [contentSearchOpen, setContentSearchOpen] = useState(false);

  // Filter files based on file name
  const filteredFiles = useMemo(() => {
    if (!fileNameFilter.trim()) return files;

    const filterLower = fileNameFilter.toLowerCase();
    
    const filterNode = (node: FileNode): FileNode | null => {
      // Check if this node matches
      const nameMatches = node.name.toLowerCase().includes(filterLower);
      
      if (node.type === "file") {
        return nameMatches ? node : null;
      }
      
      // For folders, recursively filter children
      if (node.children) {
        const filteredChildren = node.children
          .map(child => filterNode(child))
          .filter((child): child is FileNode => child !== null);
        
        // Include folder if it matches or has matching children
        if (nameMatches || filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children,
          };
        }
      }
      
      return nameMatches ? node : null;
    };

    return files
      .map(node => filterNode(node))
      .filter((node): node is FileNode => node !== null);
  }, [files, fileNameFilter]);

  const handleRootCreate = (name: string) => {
    onFileCreate(name, createType === "folder");
  };

  return (
    <>
      <FileTreeSearch
        fileNameFilter={fileNameFilter}
        onFileNameFilterChange={setFileNameFilter}
        onContentSearch={() => setContentSearchOpen(true)}
        contentSearchEnabled={allFilesWithContent.length > 0}
      />
      <ScrollArea className="h-full w-full">
        <FileTreeContextMenu
          type="root"
          onNewFile={() => {
            setCreateType("file");
            setCreateDialogOpen(true);
          }}
          onNewFolder={() => {
            setCreateType("folder");
            setCreateDialogOpen(true);
          }}
        >
          <div className="py-1 min-h-full">
            {files.length === 0 ? (
              <div className="px-4 py-8 text-center space-y-4">
                <p className="text-sm text-[#858585]">No files yet</p>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCreateType("file");
                      setCreateDialogOpen(true);
                    }}
                    className="gap-2"
                  >
                    <FilePlus className="h-4 w-4" />
                    New File
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCreateType("folder");
                      setCreateDialogOpen(true);
                    }}
                    className="gap-2"
                  >
                    <FolderPlus className="h-4 w-4" />
                    New Folder
                  </Button>
                </div>
              </div>
            ) : (
              filteredFiles.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  onFileSelect={onFileSelect}
                  selectedPath={selectedPath}
                  onFileCreate={onFileCreate}
                  onFileRename={onFileRename}
                  onFileDelete={onFileDelete}
                />
              ))
            )}
          </div>
        </FileTreeContextMenu>
      </ScrollArea>
      <CreateFileDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        type={createType}
        onConfirm={handleRootCreate}
      />
      <ContentSearchDialog
        open={contentSearchOpen}
        onOpenChange={setContentSearchOpen}
        files={allFilesWithContent}
        onFileSelect={(path) => onFileSelect?.(path)}
      />
    </>
  );
}
