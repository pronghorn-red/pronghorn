import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Circle, Loader2 } from "lucide-react";

export type AgentStatus = "idle" | "active" | "error" | "completed";

export interface Agent {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  currentTask?: string;
  progress?: number;
}

interface AgentStatusVisualizerProps {
  agents: Agent[];
}

const statusConfig = {
  idle: { icon: Circle, color: "text-muted-foreground", bg: "bg-muted", animate: false },
  active: { icon: Loader2, color: "text-warning", bg: "bg-warning/10", animate: true },
  error: { icon: Circle, color: "text-destructive", bg: "bg-destructive/10", animate: false },
  completed: { icon: Circle, color: "text-success", bg: "bg-success/10", animate: false },
};

export function AgentStatusVisualizer({ agents }: AgentStatusVisualizerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Agents</CardTitle>
        <CardDescription>
          Real-time status of AI agents working on your project
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-3">
            {agents.map((agent) => {
              const config = statusConfig[agent.status];
              const Icon = config.icon;
              
              return (
                <div
                  key={agent.id}
                  className={`p-4 rounded-lg border ${config.bg} transition-all`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 ${config.color}`}>
                      <Icon 
                        className={`h-4 w-4 ${config.animate ? "animate-spin" : ""}`} 
                      />
                    </div>
                    
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{agent.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {agent.type}
                        </Badge>
                      </div>
                      
                      {agent.currentTask && (
                        <p className="text-sm text-muted-foreground">
                          {agent.currentTask}
                        </p>
                      )}
                      
                      {agent.progress !== undefined && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium">{agent.progress}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: `${agent.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
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
