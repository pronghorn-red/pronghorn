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
  autoSync?: boolean;
  onAutoSync?: () => void;
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
  autoSync,
  onAutoSync,
}: IDEModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent 
        className="max-w-[98vw] max-h-[98vh] w-[98vw] h-[98vh] p-0 bg-[#1e1e1e]"
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onOpenChange(false);
        }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#3e3e42] bg-[#252526]">
            <div className="flex items-center gap-2">
              <Maximize2 className="h-4 w-4 text-[#858585]" />
              <h2 className="font-semibold text-sm text-[#cccccc]">Pronghorn IDE</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 hover:bg-[#2a2d2e] text-[#cccccc]"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Editor Layout */}
          <div className="flex-1 overflow-hidden">
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
                <div className="h-full border-r border-[#3e3e42] bg-[#252526]">
                  <div className="px-3 py-2 border-b border-[#3e3e42] bg-[#252526]">
                    <p className="text-xs font-medium text-[#858585] uppercase tracking-wide">Explorer</p>
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
                  onAutoSync={autoSync ? onAutoSync : undefined}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
