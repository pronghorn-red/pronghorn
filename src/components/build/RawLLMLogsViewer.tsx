import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  CheckCircle, 
  XCircle, 
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

interface RawLLMLogsViewerProps {
  projectId: string;
  shareToken: string | null;
}

interface AgentSession {
  id: string;
  created_at: string;
  status: string;
  task_description: string | null;
  mode: string;
}

interface LLMLog {
  id: string;
  session_id: string;
  project_id: string;
  iteration: number;
  model: string;
  input_prompt: string;
  input_char_count: number;
  output_raw: string | null;
  output_char_count: number | null;
  was_parse_success: boolean;
  parse_error_message: string | null;
  api_response_status: number | null;
  created_at: string;
}

export function RawLLMLogsViewer({ projectId, shareToken }: RawLLMLogsViewerProps) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LLMLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Record<string, 'input' | 'output' | 'both' | 'none'>>({});

  // Load sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      setSessionsLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_agent_sessions_with_token', {
          p_project_id: projectId,
          p_token: shareToken,
          p_limit: 50,
        });
        
        if (error) throw error;
        setSessions(data || []);
        
        // Auto-select most recent session
        if (data && data.length > 0) {
          setSelectedSessionId(data[0].id);
        }
      } catch (error) {
        console.error('Error loading sessions:', error);
        toast.error('Failed to load agent sessions');
      } finally {
        setSessionsLoading(false);
      }
    };
    
    loadSessions();
  }, [projectId, shareToken]);

  // Load logs when session changes
  useEffect(() => {
    if (!selectedSessionId) {
      setLogs([]);
      return;
    }
    
    const loadLogs = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_agent_llm_logs_with_token', {
          p_session_id: selectedSessionId,
          p_token: shareToken,
          p_limit: 200,
        });
        
        if (error) throw error;
        setLogs(data || []);
      } catch (error) {
        console.error('Error loading LLM logs:', error);
        toast.error('Failed to load LLM logs');
      } finally {
        setLoading(false);
      }
    };
    
    loadLogs();
  }, [selectedSessionId, shareToken]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSection = (logId: string, section: 'input' | 'output') => {
    setExpandedSections(prev => {
      const current = prev[logId] || 'none';
      let next: 'input' | 'output' | 'both' | 'none' = 'none';
      
      if (section === 'input') {
        if (current === 'input') next = 'none';
        else if (current === 'output') next = 'both';
        else if (current === 'both') next = 'output';
        else next = 'input';
      } else {
        if (current === 'output') next = 'none';
        else if (current === 'input') next = 'both';
        else if (current === 'both') next = 'input';
        else next = 'output';
      }
      
      return { ...prev, [logId]: next };
    });
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const formatCharCount = (count: number | null): string => {
    if (count === null) return '-';
    if (count < 1000) return `${count}`;
    if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
    return `${(count / 1000000).toFixed(2)}M`;
  };

  const getStatusIcon = (wasSuccess: boolean) => {
    return wasSuccess 
      ? <CheckCircle className="h-4 w-4 text-green-500" />
      : <XCircle className="h-4 w-4 text-destructive" />;
  };

  const isInputExpanded = (logId: string) => {
    const state = expandedSections[logId] || 'none';
    return state === 'input' || state === 'both';
  };

  const isOutputExpanded = (logId: string) => {
    const state = expandedSections[logId] || 'none';
    return state === 'output' || state === 'both';
  };

  if (sessionsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
        <p>No agent sessions found for this project.</p>
        <p className="text-sm">Run a coding agent task to see LLM logs here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Session:</span>
        <Select value={selectedSessionId || ''} onValueChange={setSelectedSessionId}>
          <SelectTrigger className="w-full max-w-md">
            <SelectValue placeholder="Select a session" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((session) => (
              <SelectItem key={session.id} value={session.id}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(session.created_at).toLocaleString()}
                  </span>
                  <Badge variant={session.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                    {session.status}
                  </Badge>
                  {session.task_description && (
                    <span className="text-xs truncate max-w-[200px]">
                      {session.task_description.slice(0, 50)}...
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No LLM logs found for this session.</p>
          <p className="text-sm">This may be an older session before logging was enabled.</p>
        </div>
      ) : (
        <ScrollArea className="h-[60vh] border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-16">Iter</TableHead>
                <TableHead className="w-32">Model</TableHead>
                <TableHead className="w-24">Input</TableHead>
                <TableHead className="w-24">Output</TableHead>
                <TableHead className="w-16">Parse</TableHead>
                <TableHead className="w-20">HTTP</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <Collapsible key={log.id} open={expandedRows.has(log.id)}>
                  <TableRow 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleRow(log.id)}
                  >
                    <TableCell>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {expandedRows.has(log.id) 
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />
                          }
                        </Button>
                      </CollapsibleTrigger>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.iteration}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono truncate max-w-[120px]">
                      {log.model}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatCharCount(log.input_char_count)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatCharCount(log.output_char_count)}
                    </TableCell>
                    <TableCell>
                      {getStatusIcon(log.was_parse_success)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.api_response_status || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                  
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={8} className="p-4">
                        <div className="space-y-4">
                          {/* Parse Error Message */}
                          {!log.was_parse_success && log.parse_error_message && (
                            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                              <p className="text-sm font-medium text-destructive">Parse Error:</p>
                              <p className="text-xs text-destructive/80 font-mono">
                                {log.parse_error_message}
                              </p>
                            </div>
                          )}
                          
                          {/* Input Section */}
                          <div className="border rounded-md">
                            <div 
                              className="flex items-center justify-between p-2 bg-muted/50 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSection(log.id, 'input');
                              }}
                            >
                              <div className="flex items-center gap-2">
                                {isInputExpanded(log.id) 
                                  ? <ChevronDown className="h-4 w-4" />
                                  : <ChevronRight className="h-4 w-4" />
                                }
                                <span className="text-sm font-medium">Input Prompt</span>
                                <Badge variant="secondary" className="text-xs">
                                  {formatCharCount(log.input_char_count)} chars
                                </Badge>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(log.input_prompt, 'Input prompt');
                                }}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copy
                              </Button>
                            </div>
                            {isInputExpanded(log.id) && (
                              <ScrollArea className="h-[300px] p-3">
                                <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                                  {log.input_prompt}
                                </pre>
                              </ScrollArea>
                            )}
                          </div>
                          
                          {/* Output Section */}
                          <div className="border rounded-md">
                            <div 
                              className="flex items-center justify-between p-2 bg-muted/50 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSection(log.id, 'output');
                              }}
                            >
                              <div className="flex items-center gap-2">
                                {isOutputExpanded(log.id) 
                                  ? <ChevronDown className="h-4 w-4" />
                                  : <ChevronRight className="h-4 w-4" />
                                }
                                <span className="text-sm font-medium">Raw Output</span>
                                <Badge variant="secondary" className="text-xs">
                                  {formatCharCount(log.output_char_count)} chars
                                </Badge>
                                {!log.was_parse_success && (
                                  <Badge variant="destructive" className="text-xs">
                                    Parse Failed
                                  </Badge>
                                )}
                              </div>
                              {log.output_raw && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(log.output_raw!, 'Raw output');
                                  }}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy
                                </Button>
                              )}
                            </div>
                            {isOutputExpanded(log.id) && (
                              <ScrollArea className="h-[300px] p-3">
                                <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                                  {log.output_raw || '(No output captured)'}
                                </pre>
                              </ScrollArea>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </div>
  );
}
