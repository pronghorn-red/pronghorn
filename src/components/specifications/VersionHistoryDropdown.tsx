import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { History, Check, RotateCcw, ChevronDown } from "lucide-react";
import { format } from "date-fns";

interface SpecVersion {
  id: string;
  version: number;
  is_latest: boolean;
  created_at: string;
}

interface VersionHistoryDropdownProps {
  versions: SpecVersion[];
  currentVersion: number;
  onSelectVersion: (specId: string) => void;
  onSetAsLatest: (specId: string) => void;
  disabled?: boolean;
}

export function VersionHistoryDropdown({
  versions,
  currentVersion,
  onSelectVersion,
  onSetAsLatest,
  disabled = false,
}: VersionHistoryDropdownProps) {
  const [open, setOpen] = useState(false);

  // Always show version badge, but only show dropdown if multiple versions
  if (versions.length <= 1) {
    return (
      <Badge variant="secondary" className="text-xs">
        v{currentVersion}
      </Badge>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          disabled={disabled}
        >
          <History className="h-3 w-3" />
          v{currentVersion}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Version History ({versions.length} versions)
        </div>
        <DropdownMenuSeparator />
        {versions.map((v) => (
          <DropdownMenuItem
            key={v.id}
            className="flex items-center justify-between cursor-pointer"
            onClick={() => onSelectVersion(v.id)}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">v{v.version}</span>
              {v.is_latest && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  Latest
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {format(new Date(v.created_at), "MMM d, HH:mm")}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {versions.find((v) => v.version === currentVersion && !v.is_latest) && (
          <DropdownMenuItem
            className="cursor-pointer text-primary"
            onClick={() => {
              const current = versions.find((v) => v.version === currentVersion);
              if (current) onSetAsLatest(current.id);
            }}
          >
            <RotateCcw className="h-3 w-3 mr-2" />
            Set v{currentVersion} as Latest
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
