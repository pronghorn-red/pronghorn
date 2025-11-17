import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { 
  Box, 
  Database, 
  Globe, 
  Webhook, 
  Shield, 
  ShieldCheck, 
  FileText, 
  ListChecks, 
  Code 
} from "lucide-react";

const nodeIcons = {
  COMPONENT: Box,
  API: Code,
  DATABASE: Database,
  SERVICE: Globe,
  WEBHOOK: Webhook,
  FIREWALL: Shield,
  SECURITY: ShieldCheck,
  REQUIREMENT: FileText,
  STANDARD: ListChecks,
  TECH_STACK: Code,
};

const nodeColors = {
  COMPONENT: "bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-400",
  API: "bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-400",
  DATABASE: "bg-purple-500/10 border-purple-500/50 text-purple-700 dark:text-purple-400",
  SERVICE: "bg-orange-500/10 border-orange-500/50 text-orange-700 dark:text-orange-400",
  WEBHOOK: "bg-pink-500/10 border-pink-500/50 text-pink-700 dark:text-pink-400",
  FIREWALL: "bg-red-500/10 border-red-500/50 text-red-700 dark:text-red-400",
  SECURITY: "bg-yellow-500/10 border-yellow-500/50 text-yellow-700 dark:text-yellow-400",
  REQUIREMENT: "bg-indigo-500/10 border-indigo-500/50 text-indigo-700 dark:text-indigo-400",
  STANDARD: "bg-teal-500/10 border-teal-500/50 text-teal-700 dark:text-teal-400",
  TECH_STACK: "bg-gray-500/10 border-gray-500/50 text-gray-700 dark:text-gray-400",
};

export const CanvasNode = memo(({ data, selected }: NodeProps) => {
  const Icon = nodeIcons[data.type as keyof typeof nodeIcons] || Box;
  const colorClass = nodeColors[data.type as keyof typeof nodeColors] || nodeColors.COMPONENT;

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 min-w-[180px]
        ${colorClass}
        ${selected ? "ring-2 ring-primary ring-offset-2" : ""}
        transition-all duration-200
      `}
    >
      <Handle type="target" position={Position.Left} className="w-2 h-2" />
      
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <div className="flex-1">
          <div className="font-medium text-sm">{data.label || "New Node"}</div>
          {data.subtitle && (
            <div className="text-xs opacity-70 mt-0.5">{data.subtitle}</div>
          )}
        </div>
      </div>
      
      <Handle type="source" position={Position.Right} className="w-2 h-2" />
    </div>
  );
});

CanvasNode.displayName = "CanvasNode";
