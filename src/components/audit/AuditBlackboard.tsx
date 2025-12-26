import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Search,
  Shield,
  Briefcase,
  Code,
  User,
  Building,
  Bot,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type BlackboardEntry = Database["public"]["Tables"]["audit_blackboard"]["Row"];

interface AuditBlackboardProps {
  entries: BlackboardEntry[];
  currentIteration?: number;
}

// Agent role icons and colors
const agentConfig: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  security_analyst: {
    icon: Shield,
    color: "text-red-500",
    label: "Security Analyst",
  },
  business_analyst: {
    icon: Briefcase,
    color: "text-blue-500",
    label: "Business Analyst",
  },
  developer: { icon: Code, color: "text-green-500", label: "Developer" },
  end_user: { icon: User, color: "text-purple-500", label: "End User" },
  architect: { icon: Building, color: "text-orange-500", label: "Architect" },
  orchestrator: { icon: Bot, color: "text-primary", label: "Orchestrator" },
};

// Entry type badges
const entryTypeConfig: Record<
  string,
  { variant: "default" | "secondary" | "outline" | "destructive"; label: string }
> = {
  observation: { variant: "default", label: "Observation" },
  finding: { variant: "destructive", label: "Finding" },
  question: { variant: "secondary", label: "Question" },
  response: { variant: "outline", label: "Response" },
  thesis: { variant: "default", label: "Thesis" },
  consensus: { variant: "default", label: "Consensus" },
  sector_complete: { variant: "secondary", label: "Sector Complete" },
};

export function AuditBlackboard({
  entries,
  currentIteration = 0,
}: AuditBlackboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    new Set()
  );

  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    return entries
      .filter((entry) => {
        const matchesSearch =
          searchQuery === "" ||
          entry.content.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole =
          filterRole === "all" || entry.agent_role === filterRole;
        const matchesType =
          filterType === "all" || entry.entry_type === filterType;
        return matchesSearch && matchesRole && matchesType;
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }, [entries, searchQuery, filterRole, filterType]);

  // Get unique roles and types for filters
  const uniqueRoles = useMemo(
    () => [...new Set(entries.map((e) => e.agent_role))],
    [entries]
  );
  const uniqueTypes = useMemo(
    () => [...new Set(entries.map((e) => e.entry_type))],
    [entries]
  );

  const toggleExpanded = (id: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getAgentConfig = (role: string) =>
    agentConfig[role] || {
      icon: Bot,
      color: "text-muted-foreground",
      label: role,
    };
  const getEntryTypeConfig = (type: string) =>
    entryTypeConfig[type] || { variant: "outline" as const, label: type };

  return (
    <Card className="h-[600px] flex flex-col overflow-hidden max-w-full">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Agent Blackboard
            {currentIteration > 0 && (
              <Badge variant="outline" className="ml-2">
                Iteration {currentIteration}
              </Badge>
            )}
          </CardTitle>
          <Badge variant="secondary">{filteredEntries.length} entries</Badge>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-3">
          <div className="relative flex-1 min-w-[120px] max-w-[200px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {uniqueRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {getAgentConfig(role).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {uniqueTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {getEntryTypeConfig(type).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="px-4 pb-4 space-y-2 min-h-0">
            {filteredEntries.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                {entries.length === 0
                  ? "No entries yet. Agent activity will appear here."
                  : "No entries match your filters."}
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const agent = getAgentConfig(entry.agent_role);
                const entryType = getEntryTypeConfig(entry.entry_type);
                const Icon = agent.icon;
                const isExpanded = expandedEntries.has(entry.id);
                const hasEvidence =
                  entry.evidence &&
                  Object.keys(entry.evidence as object).length > 0;

                return (
                  <Collapsible
                    key={entry.id}
                    open={isExpanded}
                    onOpenChange={() => toggleExpanded(entry.id)}
                  >
                    <div className="border rounded-lg bg-card overflow-hidden max-w-full">
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-start p-3 h-auto hover:bg-muted/50"
                        >
                          <div className="flex items-start gap-3 w-full min-w-0">
                            <div
                              className={`p-1.5 rounded-md bg-muted ${agent.color} shrink-0`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 text-left min-w-0 overflow-hidden">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate">
                                  {agent.label}
                                </span>
                                <Badge
                                  variant={entryType.variant}
                                  className="text-[10px] shrink-0"
                                >
                                  {entryType.label}
                                </Badge>
                                {entry.confidence !== null && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] shrink-0"
                                  >
                                    {Math.round(entry.confidence * 100)}%
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                                  {formatDistanceToNow(
                                    new Date(entry.created_at),
                                    { addSuffix: true }
                                  )}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2 break-all overflow-hidden max-w-full">
                                {entry.content}
                              </p>
                            </div>
                            {hasEvidence ? (
                              isExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                              )
                            ) : null}
                          </div>
                        </Button>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-0 border-t">
                          <div className="mt-3 space-y-2 overflow-hidden">
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {entry.content}
                            </p>
                            {entry.target_agent && (
                              <div className="text-xs text-muted-foreground">
                                Directed to:{" "}
                                <span className="font-medium">
                                  {getAgentConfig(entry.target_agent).label}
                                </span>
                              </div>
                            )}
                            {hasEvidence && (
                              <div className="bg-muted/50 rounded p-2 text-xs overflow-hidden">
                                <div className="font-medium mb-1">
                                  Evidence:
                                </div>
                                <pre className="whitespace-pre-wrap text-muted-foreground break-words overflow-x-auto max-w-full">
                                  {JSON.stringify(entry.evidence, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
