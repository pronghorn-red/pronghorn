import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { 
  Box, 
  Database, 
  Globe, 
  Webhook, 
  Shield, 
  ShieldCheck, 
  FileText, 
  ListChecks, 
  Code,
  FolderKanban,
  FileCode,
  Eye,
  EyeOff
} from "lucide-react";

export type NodeType = 
  | "PROJECT"
  | "COMPONENT" 
  | "API" 
  | "DATABASE" 
  | "SERVICE" 
  | "WEBHOOK" 
  | "FIREWALL" 
  | "SECURITY" 
  | "REQUIREMENT" 
  | "STANDARD" 
  | "TECH_STACK"
  | "PAGE";

const nodeTypes = [
  { type: "PROJECT" as const, icon: FolderKanban, label: "Project", color: "text-cyan-500" },
  { type: "PAGE" as const, icon: FileCode, label: "Page", color: "text-sky-500" },
  { type: "COMPONENT" as const, icon: Box, label: "UI Component", color: "text-blue-500" },
  { type: "API" as const, icon: Code, label: "API Endpoint", color: "text-green-500" },
  { type: "DATABASE" as const, icon: Database, label: "Database", color: "text-purple-500" },
  { type: "SERVICE" as const, icon: Globe, label: "External Service", color: "text-orange-500" },
  { type: "WEBHOOK" as const, icon: Webhook, label: "Webhook", color: "text-pink-500" },
  { type: "FIREWALL" as const, icon: Shield, label: "Firewall", color: "text-red-500" },
  { type: "SECURITY" as const, icon: ShieldCheck, label: "Security Control", color: "text-yellow-500" },
  { type: "REQUIREMENT" as const, icon: FileText, label: "Requirement", color: "text-indigo-500" },
  { type: "STANDARD" as const, icon: ListChecks, label: "Standard", color: "text-teal-500" },
  { type: "TECH_STACK" as const, icon: Code, label: "Tech Stack", color: "text-gray-500" },
];

interface NodePaletteProps {
  onDragStart?: (type: NodeType) => void;
  visibleNodeTypes: Set<NodeType>;
  onToggleVisibility: (type: NodeType) => void;
}

export function NodePalette({ onDragStart, visibleNodeTypes, onToggleVisibility }: NodePaletteProps) {
  const handleDragStart = (e: React.DragEvent, type: NodeType) => {
    e.dataTransfer.setData("application/reactflow", type);
    e.dataTransfer.effectAllowed = "move";
    onDragStart?.(type);
  };

  return (
    <Card className="w-64 border-r border-border rounded-none">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-lg">Node Palette</CardTitle>
        <CardDescription>
          Drag nodes onto the canvas
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-12rem)]">
          <div className="p-4 space-y-2">
            {nodeTypes.map((node) => {
              const isVisible = visibleNodeTypes.has(node.type);
              return (
                <div
                  key={node.type}
                  className="flex items-center gap-2"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(node.type);
                    }}
                  >
                    {isVisible ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4 opacity-50" />
                    )}
                  </Button>
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, node.type)}
                    className={`flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted cursor-move transition-colors flex-1 ${
                      !isVisible ? "opacity-50" : ""
                    }`}
                  >
                    <div className={`p-2 rounded ${node.color} bg-current/10`}>
                      <node.icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium">{node.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
