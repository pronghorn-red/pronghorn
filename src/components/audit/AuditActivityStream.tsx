import { useEffect, useRef, useState, useMemo } from "react";
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
  Layers,
  List,
  FileSearch,
  Pencil,
  Eye,
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

interface IterationSummary {
  iteration: number;
  phase: string;
  startTime: Date;
  endTime: Date;
  toolCalls: {
    reads: number;
    creates: number;
    writes: number;
    other: number;
  };
  llmCalls: number;
  errors: number;
  activities: ActivityEntry[];
}

// Tool categorization
const READ_TOOLS = ['read_dataset_item', 'query_knowledge_graph', 'read_blackboard', 'get_concept_links'];
const CREATE_TOOLS = ['create_concept', 'link_concepts'];
const WRITE_TOOLS = ['write_blackboard', 'record_tesseract_cell'];

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

// Extract tool name from activity title like "Tool: read_dataset_item"
function extractToolName(title: string): string | null {
  const match = title.match(/Tool:\s*(\w+)/i);
  return match ? match[1] : null;
}

// Extract iteration number from activity title or metadata
function extractIteration(activity: ActivityEntry): number | null {
  // Check metadata first
  if (activity.metadata?.iteration !== undefined) {
    return Number(activity.metadata.iteration);
  }
  // Check title for "Iteration X" pattern
  const match = activity.title.match(/Iteration\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// Extract phase from activity
function extractPhase(activity: ActivityEntry): string | null {
  if (activity.metadata?.phase) {
    return String(activity.metadata.phase);
  }
  if (activity.activity_type === 'phase_change') {
    return activity.title.replace(/Phase:\s*/i, '');
  }
  return null;
}

function categorizeToolCall(toolName: string): 'reads' | 'creates' | 'writes' | 'other' {
  if (READ_TOOLS.includes(toolName)) return 'reads';
  if (CREATE_TOOLS.includes(toolName)) return 'creates';
  if (WRITE_TOOLS.includes(toolName)) return 'writes';
  return 'other';
}

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

function CondensedIterationRow({ 
  summary, 
  isExpanded, 
  onToggle 
}: { 
  summary: IterationSummary; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const totalTools = summary.toolCalls.reads + summary.toolCalls.creates + summary.toolCalls.writes + summary.toolCalls.other;
  
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div 
        className={`bg-muted/30 rounded-lg border-l-4 ${
          summary.errors > 0 ? 'border-l-destructive' : 'border-l-primary'
        } transition-colors hover:bg-muted/50`}
      >
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 text-left">
            <div className="flex items-center justify-between gap-4">
              {/* Left: Iteration number and phase */}
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold text-primary min-w-[3ch] text-center">
                  {summary.iteration}
                </div>
                <Badge variant="outline" className="text-xs whitespace-nowrap">
                  {summary.phase || 'PROCESSING'}
                </Badge>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              
              {/* Middle: Tool call breakdown */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5" title="Reads">
                  <FileSearch className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">{summary.toolCalls.reads}</span>
                </div>
                <div className="flex items-center gap-1.5" title="Creates">
                  <Plus className="h-4 w-4 text-green-500" />
                  <span className="font-medium">{summary.toolCalls.creates}</span>
                </div>
                <div className="flex items-center gap-1.5" title="Writes">
                  <Pencil className="h-4 w-4 text-orange-500" />
                  <span className="font-medium">{summary.toolCalls.writes}</span>
                </div>
                {summary.toolCalls.other > 0 && (
                  <div className="flex items-center gap-1.5" title="Other">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{summary.toolCalls.other}</span>
                  </div>
                )}
                {summary.errors > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {summary.errors} error{summary.errors > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              
              {/* Right: Timing and totals */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="hidden sm:inline">{totalTools} tools</span>
                <span>{formatDistanceToNow(summary.endTime, { addSuffix: true })}</span>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 border-t border-border/50 mt-1">
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {summary.activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function AuditActivityStream({ activities, isLoading }: AuditActivityStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'condensed' | 'detailed'>('condensed');
  const [expandedIterations, setExpandedIterations] = useState<Set<number>>(new Set());

  // Auto-scroll to bottom when new activities come in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities.length]);

  // Aggregate activities into iteration summaries
  const iterationSummaries = useMemo(() => {
    const summaryMap = new Map<number, IterationSummary>();
    let currentPhase = 'INITIALIZATION';
    let currentIteration = 0;

    // Process activities in chronological order
    const sortedActivities = [...activities].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    for (const activity of sortedActivities) {
      // Extract or infer iteration
      const extractedIteration = extractIteration(activity);
      if (extractedIteration !== null) {
        currentIteration = extractedIteration;
      }

      // Extract phase changes
      const extractedPhase = extractPhase(activity);
      if (extractedPhase) {
        currentPhase = extractedPhase;
      }

      // Get or create summary for this iteration
      if (!summaryMap.has(currentIteration)) {
        summaryMap.set(currentIteration, {
          iteration: currentIteration,
          phase: currentPhase,
          startTime: new Date(activity.created_at),
          endTime: new Date(activity.created_at),
          toolCalls: { reads: 0, creates: 0, writes: 0, other: 0 },
          llmCalls: 0,
          errors: 0,
          activities: [],
        });
      }

      const summary = summaryMap.get(currentIteration)!;
      summary.activities.push(activity);
      summary.endTime = new Date(activity.created_at);
      summary.phase = currentPhase;

      // Categorize activity
      if (activity.activity_type === 'tool_call') {
        const toolName = extractToolName(activity.title);
        if (toolName) {
          const category = categorizeToolCall(toolName);
          summary.toolCalls[category]++;
        } else {
          summary.toolCalls.other++;
        }
      } else if (activity.activity_type === 'llm_call') {
        summary.llmCalls++;
      } else if (activity.activity_type === 'error' || activity.activity_type === 'failure') {
        summary.errors++;
      }
    }

    // Convert to array and sort by iteration (descending - newest first)
    return Array.from(summaryMap.values()).sort((a, b) => b.iteration - a.iteration);
  }, [activities]);

  const toggleIteration = (iteration: number) => {
    setExpandedIterations(prev => {
      const next = new Set(prev);
      if (next.has(iteration)) {
        next.delete(iteration);
      } else {
        next.add(iteration);
      }
      return next;
    });
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5" />
            <span className="hidden sm:inline">Stream of Consciousness</span>
            <span className="sm:hidden">Activity</span>
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === 'condensed' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 rounded-r-none"
                onClick={() => setViewMode('condensed')}
              >
                <Layers className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:ml-1">Condensed</span>
              </Button>
              <Button
                variant={viewMode === 'detailed' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 rounded-l-none"
                onClick={() => setViewMode('detailed')}
              >
                <List className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:ml-1">Detailed</span>
              </Button>
            </div>
            
            <Badge variant="outline" className="hidden sm:flex">
              {viewMode === 'condensed' 
                ? `${iterationSummaries.length} iterations`
                : `${activities.length} events`
              }
            </Badge>
          </div>
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
          ) : viewMode === 'condensed' ? (
            <div className="space-y-2">
              {/* Legend for condensed view */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 pb-2 border-b">
                <div className="flex items-center gap-1">
                  <FileSearch className="h-3 w-3 text-blue-500" />
                  <span>Reads</span>
                </div>
                <div className="flex items-center gap-1">
                  <Plus className="h-3 w-3 text-green-500" />
                  <span>Creates</span>
                </div>
                <div className="flex items-center gap-1">
                  <Pencil className="h-3 w-3 text-orange-500" />
                  <span>Writes</span>
                </div>
              </div>
              
              {iterationSummaries.map((summary) => (
                <CondensedIterationRow
                  key={summary.iteration}
                  summary={summary}
                  isExpanded={expandedIterations.has(summary.iteration)}
                  onToggle={() => toggleIteration(summary.iteration)}
                />
              ))}
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
