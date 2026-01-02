import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Layout, Image, FileText, BarChart3, List, Quote, GitBranch, Grid2x2, Clock } from "lucide-react";

interface LayoutSelectorProps {
  value: string;
  onChange: (layoutId: string) => void;
}

const LAYOUTS = [
  { id: "title-cover", name: "Title Cover", icon: Layout, category: "title" },
  { id: "section-divider", name: "Section Divider", icon: Layout, category: "divider" },
  { id: "title-content", name: "Title + Content", icon: FileText, category: "content" },
  { id: "bullets", name: "Bullet Points", icon: List, category: "content" },
  { id: "two-column", name: "Two Columns", icon: Grid2x2, category: "content" },
  { id: "image-left", name: "Image Left", icon: Image, category: "media" },
  { id: "image-right", name: "Image Right", icon: Image, category: "media" },
  { id: "architecture", name: "Architecture", icon: GitBranch, category: "technical" },
  { id: "stats-grid", name: "Statistics Grid", icon: BarChart3, category: "data" },
  { id: "timeline", name: "Timeline", icon: Clock, category: "content" },
  { id: "icon-grid", name: "Icon Grid", icon: Grid2x2, category: "content" },
  { id: "quote", name: "Quote", icon: Quote, category: "accent" },
  { id: "comparison", name: "Comparison", icon: Grid2x2, category: "content" },
];

export function LayoutSelector({ value, onChange }: LayoutSelectorProps) {
  const currentLayout = LAYOUTS.find(l => l.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px] h-8 text-xs">
        <SelectValue placeholder="Select layout">
          {currentLayout?.name || "Select layout"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LAYOUTS.map((layout) => {
          const Icon = layout.icon;
          return (
            <SelectItem key={layout.id} value={layout.id}>
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                <span>{layout.name}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
