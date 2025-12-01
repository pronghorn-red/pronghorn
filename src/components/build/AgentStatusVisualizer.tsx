import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Circle, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

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
  idle: { 
    icon: Circle, 
    color: "text-muted-foreground", 
    bg: "bg-muted", 
    label: "Idle",
    animate: false 
  },
  active: { 
    icon: Loader2, 
    color: "text-warning", 
    bg: "bg-warning/10", 
    label: "Active",
    animate: true 
  },
  error: { 
    icon: AlertCircle, 
    color: "text-destructive", 
    bg: "bg-destructive/10", 
    label: "Error",
    animate: false 
  },
  completed: { 
    icon: CheckCircle2, 
    color: "text-success", 
    bg: "bg-success/10", 
    label: "Completed",
    animate: false 
  },
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
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-center">
              <Circle className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No active agents. Submit a task to get started.
              </p>
            </div>
          ) : (
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
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {agent.type}
                            </Badge>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${config.color}`}
                            >
                              {config.label}
                            </Badge>
                          </div>
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
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
