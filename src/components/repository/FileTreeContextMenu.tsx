import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FilePlus, FolderPlus, Edit, Trash2 } from "lucide-react";

interface FileTreeContextMenuProps {
  children: React.ReactNode;
  type: "file" | "folder" | "root";
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

export function FileTreeContextMenu({
  children,
  type,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: FileTreeContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onNewFile} className="cursor-pointer">
          <FilePlus className="h-4 w-4 mr-2" />
          New File
        </ContextMenuItem>
        <ContextMenuItem onClick={onNewFolder} className="cursor-pointer">
          <FolderPlus className="h-4 w-4 mr-2" />
          New Folder
        </ContextMenuItem>
        {type !== "root" && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onRename} className="cursor-pointer">
              <Edit className="h-4 w-4 mr-2" />
              Rename
            </ContextMenuItem>
            <ContextMenuItem onClick={onDelete} className="cursor-pointer text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
