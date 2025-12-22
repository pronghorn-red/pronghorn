import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  FileType,
  FileJson,
  Download,
  Trash2,
  Eye,
  RotateCcw,
  AlertTriangle,
  Archive,
} from "lucide-react";
import { format } from "date-fns";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VersionHistoryDropdown } from "./VersionHistoryDropdown";
import { MarkdownProcessor } from "@/utils/markdownProcessor";
import { toast } from "sonner";

export interface SavedSpecification {
  id: string;
  agent_id: string;
  agent_title: string;
  version: number;
  is_latest: boolean;
  generated_spec: string;
  raw_data: any;
  created_at: string;
  generated_by_user_id: string | null;
  generated_by_token: string | null;
}

interface SavedSpecificationsPanelProps {
  specifications: SavedSpecification[];
  allVersions: Record<string, SavedSpecification[]>;
  selectedVersions: Record<string, SavedSpecification>;
  onView: (spec: SavedSpecification) => void;
  onDownload: (spec: SavedSpecification) => void;
  onSaveAsArtifact: (spec: SavedSpecification) => void;
  onDelete: (specId: string) => void;
  onSetAsLatest: (specId: string) => void;
  onReturnToLatest: (agentId: string) => void;
  onLoadVersions: (agentId: string) => void;
  isLoading?: boolean;
}

export function SavedSpecificationsPanel({
  specifications,
  allVersions,
  selectedVersions,
  onView,
  onDownload,
  onSaveAsArtifact,
  onDelete,
  onSetAsLatest,
  onReturnToLatest,
  onLoadVersions,
  isLoading = false,
}: SavedSpecificationsPanelProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [specToDelete, setSpecToDelete] = useState<string | null>(null);

  const handleDeleteClick = (specId: string) => {
    setSpecToDelete(specId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (specToDelete) {
      onDelete(specToDelete);
    }
    setDeleteDialogOpen(false);
    setSpecToDelete(null);
  };

  const sanitizeFilename = (name: string) => {
    return name
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 50) || "specification";
  };

  const handleDownloadWord = async (spec: SavedSpecification) => {
    try {
      const processor = new MarkdownProcessor();
      const sections = [{ title: spec.agent_title, value: spec.generated_spec }];
      const blob = await processor.generateWordDocument(spec.agent_title, sections);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFilename(spec.agent_title)}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Downloaded as Word document");
    } catch (error) {
      console.error("Error downloading Word:", error);
      toast.error("Failed to download Word document");
    }
  };

  const handleDownloadMarkdown = (spec: SavedSpecification) => {
    try {
      const markdownContent = `# ${spec.agent_title}\n\n${spec.generated_spec}`;
      const blob = new Blob([markdownContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFilename(spec.agent_title)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Downloaded as Markdown");
    } catch (error) {
      console.error("Error downloading Markdown:", error);
      toast.error("Failed to download Markdown");
    }
  };

  const handleDownloadJson = (spec: SavedSpecification) => {
    try {
      const jsonContent = JSON.stringify({
        agent_id: spec.agent_id,
        agent_title: spec.agent_title,
        version: spec.version,
        generated_spec: spec.generated_spec,
        raw_data: spec.raw_data,
        created_at: spec.created_at,
      }, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFilename(spec.agent_title)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Downloaded as JSON");
    } catch (error) {
      console.error("Error downloading JSON:", error);
      toast.error("Failed to download JSON");
    }
  };

  // Get the displayed spec for an agent (selected version or latest)
  const getDisplayedSpec = (agentId: string): SavedSpecification => {
    return selectedVersions[agentId] || specifications.find(s => s.agent_id === agentId)!;
  };

  if (specifications.length === 0 && !isLoading) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Saved Specifications
            <Badge variant="secondary" className="ml-auto">
              {specifications.length} agents
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading saved specifications...
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {specifications.map((latestSpec) => {
                  const versions = allVersions[latestSpec.agent_id] || [latestSpec];
                  const displayedSpec = getDisplayedSpec(latestSpec.agent_id);
                  const isViewingOldVersion = displayedSpec && !displayedSpec.is_latest;
                  const totalVersions = versions.length;
                  
                  return (
                    <div
                      key={latestSpec.agent_id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        isViewingOldVersion 
                          ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20' 
                          : 'bg-card hover:bg-accent/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">
                            {displayedSpec.agent_title}
                          </span>
                          <VersionHistoryDropdown
                            versions={versions}
                            currentVersion={displayedSpec.version}
                            totalVersions={totalVersions}
                            onSelectVersion={(id) => {
                              const selectedSpec = versions.find((v) => v.id === id);
                              if (selectedSpec) onView(selectedSpec);
                            }}
                            onSetAsLatest={onSetAsLatest}
                          />
                          {isViewingOldVersion && (
                            <Badge variant="outline" className="text-amber-600 border-amber-500/50 bg-amber-500/10 text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Not Latest
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Generated {format(new Date(displayedSpec.created_at), "MMM d, yyyy 'at' HH:mm")}
                          {displayedSpec.generated_spec && (
                            <span className="ml-2">
                              • {(displayedSpec.generated_spec.length / 1000).toFixed(1)}k chars
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {isViewingOldVersion && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs gap-1 text-amber-600 hover:text-amber-700"
                            onClick={() => onReturnToLatest(latestSpec.agent_id)}
                            title="Return to latest version"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Latest
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onView(displayedSpec)}
                          title="View specification"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem onClick={() => handleDownloadWord(displayedSpec)} className="cursor-pointer">
                              <FileType className="h-4 w-4 mr-2" />
                              Download as Word
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadMarkdown(displayedSpec)} className="cursor-pointer">
                              <FileText className="h-4 w-4 mr-2" />
                              Download as Markdown
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadJson(displayedSpec)} className="cursor-pointer">
                              <FileJson className="h-4 w-4 mr-2" />
                              Download as JSON
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onSaveAsArtifact(displayedSpec)}
                          title="Save as Artifact"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteClick(displayedSpec.id)}
                          title="Delete this version"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Specification</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this specification version? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
