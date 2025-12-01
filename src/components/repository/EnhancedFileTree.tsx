import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileTreeContextMenu } from "./FileTreeContextMenu";
import { CreateFileDialog } from "./CreateFileDialog";
import { RenameDialog } from "./RenameDialog";
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
  const [isOpen, setIsOpen] = useState(level === 0);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createType, setCreateType] = useState<"file" | "folder">("file");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
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

export function EnhancedFileTree({ files, onFileSelect, selectedPath, onFileCreate, onFileRename, onFileDelete }: EnhancedFileTreeProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createType, setCreateType] = useState<"file" | "folder">("file");

  const handleRootCreate = (name: string) => {
    onFileCreate(name, createType === "folder");
  };

  return (
    <>
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
          <div className="space-y-0.5 p-2">
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Right-click to create files
              </p>
            ) : (
              files.map((node) => (
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
    </>
  );
}
