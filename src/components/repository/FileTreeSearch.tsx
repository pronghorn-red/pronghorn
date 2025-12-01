import { Input } from "@/components/ui/input";
import { Search, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileTreeSearchProps {
  fileNameFilter: string;
  onFileNameFilterChange: (value: string) => void;
  onContentSearch: () => void;
  contentSearchEnabled?: boolean;
}

export function FileTreeSearch({
  fileNameFilter,
  onFileNameFilterChange,
  onContentSearch,
  contentSearchEnabled = true,
}: FileTreeSearchProps) {
  return (
    <div className="px-3 py-2 border-b border-[#3e3e42] bg-[#252526] space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#858585]" />
        <Input
          placeholder="Filter by filename..."
          value={fileNameFilter}
          onChange={(e) => onFileNameFilterChange(e.target.value)}
          className="h-7 pl-7 bg-[#3c3c3c] border-[#3e3e42] text-[#cccccc] text-xs placeholder:text-[#858585] focus-visible:ring-[#007acc]"
        />
      </div>
      {contentSearchEnabled && (
        <Button
          variant="outline"
          size="sm"
          onClick={onContentSearch}
          className="w-full h-7 gap-1.5 bg-[#2a2d2e] text-[#cccccc] border-[#3e3e42] hover:bg-[#313335] text-xs"
        >
          <FileSearch className="h-3 w-3" />
          Search in Files
        </Button>
      )}
    </div>
  );
}
