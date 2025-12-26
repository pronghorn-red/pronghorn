import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Brain,
  Wrench,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  Plus,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Link2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityEntry {
  id: string;
  session_id: string;
  agent_role: string | null;
  activity_type: string;
  title: string;
  content: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface AuditActivityStreamProps {
  activities: ActivityEntry[];
  isLoading?: boolean;
}

const AGENT_COLORS: Record<string, string> = {
  security_analyst: "text-red-500",
  business_analyst: "text-blue-500",
  developer: "text-green-500",
  end_user: "text-purple-500",
  architect: "text-orange-500",
  orchestrator: "text-yellow-500",
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  thinking: <Brain className="h-4 w-4" />,
  tool_call: <Wrench className="h-4 w-4" />,
  response: <MessageSquare className="h-4 w-4" />,
  error: <AlertCircle className="h-4 w-4" />,
  phase_change: <ArrowRight className="h-4 w-4" />,
  node_insert: <Plus className="h-4 w-4" />,
  edge_insert: <Link2 className="h-4 w-4" />,
  blackboard_write: <FileText className="h-4 w-4" />,
  llm_call: <Loader2 className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  failure: <XCircle className="h-4 w-4" />,
};

const ACTIVITY_COLORS: Record<string, string> = {
  thinking: "border-l-yellow-500",
  tool_call: "border-l-blue-500",
  response: "border-l-green-500",
  error: "border-l-red-500",
  phase_change: "border-l-purple-500",
  node_insert: "border-l-emerald-500",
  edge_insert: "border-l-cyan-500",
  blackboard_write: "border-l-cyan-500",
  llm_call: "border-l-orange-500",
  success: "border-l-green-500",
  failure: "border-l-red-500",
};

function ActivityItem({ activity }: { activity: ActivityEntry }) {
  const [isOpen, setIsOpen] = useState(false);
  const isLongContent = activity.content && activity.content.length > 200;
  const isRawResponse = activity.metadata?.rawResponse === true;

  return (
    <div
      className={`border-l-4 ${ACTIVITY_COLORS[activity.activity_type] || "border-l-muted"} bg-muted/30 rounded-r-lg p-3 overflow-hidden`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <div className="mt-0.5 text-muted-foreground shrink-0">
          {ACTIVITY_ICONS[activity.activity_type] || <MessageSquare className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            {activity.agent_role && (
              <Badge variant="outline" className={`text-xs ${AGENT_COLORS[activity.agent_role] || ""}`}>
                {activity.agent_role.replace(/_/g, " ")}
              </Badge>
            )}
            <span className="font-medium text-sm truncate">{activity.title}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
            </span>
          </div>
          
          {activity.content && (
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <div className="mt-1">
                {isLongContent || isRawResponse ? (
                  <>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                        {isOpen ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                        {isOpen ? "Collapse" : "Show full response"} 
                        {isRawResponse && <Badge variant="secondary" className="ml-1 text-[10px]">RAW JSON</Badge>}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-2 p-3 bg-background/50 rounded text-xs overflow-x-auto max-h-[600px] overflow-y-auto font-mono whitespace-pre-wrap break-all">
                        {activity.content}
                      </pre>
                    </CollapsibleContent>
                    {!isOpen && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2 break-words overflow-hidden">
                        {activity.content.slice(0, 200)}...
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words overflow-hidden">
                    {activity.content}
                  </p>
                )}
              </div>
            </Collapsible>
          )}
          
          {activity.metadata && Object.keys(activity.metadata).filter(k => k !== 'rawResponse').length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(activity.metadata)
                .filter(([key]) => key !== 'rawResponse')
                .slice(0, 5)
                .map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="text-xs">
                    {key}: {typeof value === "object" ? JSON.stringify(value).slice(0, 30) : String(value).slice(0, 30)}
                  </Badge>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuditActivityStream({ activities, isLoading }: AuditActivityStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new activities come in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities.length]);

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Stream of Consciousness
          </CardTitle>
          <Badge variant="outline">{activities.length} events</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef}>
          {isLoading && activities.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Brain className="h-12 w-12 mb-2 opacity-50" />
              <p>No activity yet</p>
              <p className="text-sm">Start an audit to see agent thinking</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...activities].reverse().map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
