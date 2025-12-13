import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  Download,
  Trash2,
  Eye,
  History,
  ChevronRight,
  RotateCcw,
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
import { VersionHistoryDropdown } from "./VersionHistoryDropdown";

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
  onView: (spec: SavedSpecification) => void;
  onDownload: (spec: SavedSpecification) => void;
  onDelete: (specId: string) => void;
  onSetAsLatest: (specId: string) => void;
  onLoadVersions: (agentId: string) => void;
  isLoading?: boolean;
}

export function SavedSpecificationsPanel({
  specifications,
  allVersions,
  onView,
  onDownload,
  onDelete,
  onSetAsLatest,
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
                {specifications.map((spec) => {
                  const versions = allVersions[spec.agent_id] || [spec];
                  return (
                    <div
                      key={spec.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {spec.agent_title}
                          </span>
                          <VersionHistoryDropdown
                            versions={versions}
                            currentVersion={spec.version}
                            onSelectVersion={(id) => {
                              const selectedSpec = versions.find((v) => v.id === id);
                              if (selectedSpec) onView(selectedSpec);
                            }}
                            onSetAsLatest={onSetAsLatest}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Generated {format(new Date(spec.created_at), "MMM d, yyyy 'at' HH:mm")}
                          {spec.generated_spec && (
                            <span className="ml-2">
                              • {(spec.generated_spec.length / 1000).toFixed(1)}k chars
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onView(spec)}
                          title="View specification"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onDownload(spec)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteClick(spec.id)}
                          title="Delete"
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
