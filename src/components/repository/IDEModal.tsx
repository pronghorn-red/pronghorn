import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Maximize2 } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { EnhancedFileTree } from "./EnhancedFileTree";
import { CodeEditor } from "./CodeEditor";

interface IDEModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileStructure: any[];
  selectedFilePath: string | null;
  selectedFileId: string | null;
  selectedRepoId: string;
  onFileSelect: (path: string) => void;
  onFileSave: () => void;
  onFileCreate: (path: string, isFolder: boolean) => void;
  onFileRename: (oldPath: string, newPath: string) => void;
  onFileDelete: (path: string) => void;
}

export function IDEModal({
  open,
  onOpenChange,
  fileStructure,
  selectedFilePath,
  selectedFileId,
  selectedRepoId,
  onFileSelect,
  onFileSave,
  onFileCreate,
  onFileRename,
  onFileDelete,
}: IDEModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] max-h-[98vh] w-[98vw] h-[98vh] p-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Maximize2 className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">Full-Screen IDE</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Editor Layout */}
          <div className="flex-1 overflow-hidden">
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
                <div className="h-full border-r">
                  <div className="p-2 border-b bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Explorer</p>
                  </div>
                  <EnhancedFileTree
                    files={fileStructure}
                    onFileSelect={onFileSelect}
                    selectedPath={selectedFilePath}
                    onFileCreate={onFileCreate}
                    onFileRename={onFileRename}
                    onFileDelete={onFileDelete}
                  />
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize={80}>
                <CodeEditor
                  fileId={selectedFileId}
                  filePath={selectedFilePath}
                  repoId={selectedRepoId}
                  onClose={() => onFileSelect("")}
                  onSave={onFileSave}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
