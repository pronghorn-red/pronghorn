import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Bot, 
  Loader2, 
  Send, 
  User,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  ChevronRight,
  Square,
  Database,
  Table2,
  Code,
  FileText,
  Settings,
  Sliders,
  Paperclip,
  BookOpen,
  Download,
  X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useInfiniteAgentMessages } from '@/hooks/useInfiniteAgentMessages';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentPromptEditor } from '@/components/build/AgentPromptEditor';
import { RawLLMLogsViewer } from '@/components/build/RawLLMLogsViewer';
import { AgentConfigurationModal, AgentConfiguration } from '@/components/build/AgentConfigurationModal';
import { ProjectSelector, ProjectSelectionResult } from '@/components/project/ProjectSelector';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface SchemaInfo {
  name: string;
  tables: string[];
  views: string[];
  functions: string[];
}

interface DatabaseAgentInterfaceProps {
  projectId: string;
  databaseId?: string;
  connectionId?: string;
  shareToken: string | null;
  schemas: SchemaInfo[];
  onSchemaRefresh: () => void;
  onMigrationRefresh?: () => void;
  onCollapse?: () => void;
}

export function DatabaseAgentInterface({
  projectId,
  databaseId,
  connectionId,
  shareToken,
  schemas,
  onSchemaRefresh,
  onMigrationRefresh,
  onCollapse
}: DatabaseAgentInterfaceProps) {
  const { messages: loadedMessages, loading: messagesLoading, refetch: refetchMessages } = useInfiniteAgentMessages(projectId, shareToken, "database");
  
  const [messages, setMessages] = useState<any[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'prompt' | 'logs'>('chat');
  const [isAgentConfigOpen, setIsAgentConfigOpen] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentConfiguration>({
    exposeProject: false,
    maxIterations: 50,
  });
  
  // ProjectSelector state
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [attachedContext, setAttachedContext] = useState<ProjectSelectionResult | null>(null);
  
  // Chat history settings state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDownloadingHistory, setIsDownloadingHistory] = useState(false);
  const [chatHistorySettings, setChatHistorySettings] = useState<{
    includeHistory: boolean;
    durationType: 'time' | 'messages';
    durationValue: number;
  }>({
    includeHistory: false,
    durationType: 'time',
    durationValue: 20,
  });
  
  // SSE streaming progress state
  const [streamProgress, setStreamProgress] = useState<{
    iteration: number;
    maxIterations: number;
    charsReceived: number;
    currentOperation: string | null;
    status: 'idle' | 'streaming' | 'processing' | 'complete';
    streamingContent: string;
  }>({
    iteration: 0,
    maxIterations: 50,
    charsReceived: 0,
    currentOperation: null,
    status: 'idle',
    streamingContent: '',
  });
  
  // Streaming message for real-time display
  const [streamingMessage, setStreamingMessage] = useState<{
    content: string;
    isStreaming: boolean;
  } | null>(null);
  
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStoppingRef = useRef<boolean>(false);
  
  // Scroll position preservation refs
  const anchorIdBeforeLoad = useRef<string | null>(null);
  const anchorOffsetBeforeLoad = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(0);
  
  // Helper function to parse streaming content and extract readable text
  const parseStreamingContent = (content: string): string => {
    let cleaned = content.trim();
    
    // Strip markdown code fences that LLM might add
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();
    
    try {
      if (cleaned.startsWith('{')) {
        const reasoningMatch = cleaned.match(/"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
        if (reasoningMatch) {
          return reasoningMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }
      }
    } catch {
      // Fall through to return raw content
    }
    return cleaned;
  };
  
  // Sync loaded messages with local state using smart deduplication
  useEffect(() => {
    setMessages(prev => {
      // Get IDs of real messages from database
      const realMessageIds = new Set(loadedMessages.map((m: any) => m.id));
      
      // Keep optimistic messages only if no matching real message exists
      const optimisticToKeep = prev.filter(optMsg => {
        if (!optMsg.id?.startsWith('temp-')) return false;
        // Check if a real version exists (same role + content)
        const hasRealVersion = loadedMessages.some((realMsg: any) => 
          realMsg.role === optMsg.role && 
          realMsg.content === optMsg.content
        );
        return !hasRealVersion;
      });
      
      // Combine and sort by timestamp
      return [...loadedMessages, ...optimisticToKeep].sort((a: any, b: any) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
    
    // Clear streaming message when a new agent message arrives from real-time subscription
    if (loadedMessages.some((m: any) => m.role === 'agent')) {
      setStreamingMessage(null);
    }
  }, [loadedMessages]);
  
  // Scroll to bottom when messages first load
  const hasInitiallyScrolled = useRef(false);
  useEffect(() => {
    if (!messagesLoading && loadedMessages.length > 0 && !hasInitiallyScrolled.current) {
      hasInitiallyScrolled.current = true;
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 150);
    }
  }, [messagesLoading, loadedMessages.length]);
  
  // Auto-scroll detection
  useEffect(() => {
    const scrollArea = scrollViewportRef.current;
    if (!scrollArea) return;
    
    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return;
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      setIsAutoScrollEnabled(distanceFromBottom < 100);
    };
    
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Auto-scroll when streaming (throttled for performance)
  useEffect(() => {
    if (streamingMessage?.isStreaming && isAutoScrollEnabled && messagesEndRef.current) {
      const now = Date.now();
      // Throttle scroll to once per 100ms for performance
      if (now - lastScrollTimeRef.current > 100) {
        lastScrollTimeRef.current = now;
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [streamingMessage?.content, streamingMessage?.isStreaming, isAutoScrollEnabled]);
  
  // Calculate total attached items
  const totalAttachments = attachedContext 
    ? (attachedContext.artifacts?.length || 0) +
      (attachedContext.requirements?.length || 0) +
      (attachedContext.standards?.length || 0) +
      (attachedContext.techStacks?.length || 0) +
      (attachedContext.canvasNodes?.length || 0) +
      (attachedContext.files?.length || 0) +
      (attachedContext.databases?.length || 0)
    : 0;
  
  // Handle context attachment
  const handleContextAttachment = (selection: ProjectSelectionResult) => {
    setAttachedContext(selection);
    setIsProjectSelectorOpen(false);
    const count = 
      (selection.artifacts?.length || 0) +
      (selection.requirements?.length || 0) +
      (selection.standards?.length || 0) +
      (selection.techStacks?.length || 0) +
      (selection.canvasNodes?.length || 0) +
      (selection.files?.length || 0) +
      (selection.databases?.length || 0);
    toast.success(`Attached ${count} context items`);
  };
  
  // Download chat history
  const handleDownloadChatHistory = async () => {
    setIsDownloadingHistory(true);
    try {
      const { data, error } = await supabase.rpc('get_agent_messages_with_token', {
        p_project_id: projectId,
        p_token: shareToken,
        p_limit: 1000,
        p_offset: 0,
        p_since: null,
        p_agent_type: 'database',
      });
      if (error) throw error;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `database-agent-history-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Chat history downloaded');
    } catch (error: any) {
      toast.error(`Download failed: ${error.message}`);
    } finally {
      setIsDownloadingHistory(false);
    }
  };
  
  // Removed aggressive scroll position preservation - was causing unwanted scrolling
  
  const handleSubmit = async () => {
    if (!taskInput.trim() || isSubmitting) return;
    if (!databaseId && !connectionId) {
      toast.error('No database selected');
      return;
    }
    
    // Reset stop flag at start
    isStoppingRef.current = false;
    
    const userMessageContent = taskInput;
    setIsSubmitting(true);
    setTaskInput('');
    setIsAutoScrollEnabled(true);
    
    // Optimistic user message
    const optimisticUserMessage = {
      id: `temp-${Date.now()}`,
      session_id: "temp",
      role: "user",
      content: userMessageContent,
      metadata: { mode: 'database' },
      created_at: new Date().toISOString(),
    };
    
    const previousMessages = messages;
    setMessages((prev: any[]) => [...prev, optimisticUserMessage]);
    
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 0);
    
    try {
      setStreamProgress({ 
        iteration: 0, 
        maxIterations: 50, 
        charsReceived: 0, 
        currentOperation: null, 
        status: 'idle',
        streamingContent: ''
      });
      
      const supabaseUrl = 'https://obkzdksfayygnrzdqoam.supabase.co';
      const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8';
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token || supabaseAnonKey;
      
      // Frontend-driven iteration loop
      let currentSessionId: string | null = null;
      let currentIteration = 1;
      let status = 'in_progress';
      const maxIterations = agentConfig.maxIterations;
      
      while (status === 'in_progress' && currentIteration <= maxIterations) {
        // Check if user clicked stop before starting new iteration
        if (isStoppingRef.current) {
          console.log('Stop requested, exiting loop');
          break;
        }
        
        abortControllerRef.current = new AbortController();
        
        setStreamProgress(p => ({ 
          ...p, 
          iteration: currentIteration, 
          maxIterations,
          status: 'streaming',
          charsReceived: 0,
          streamingContent: ''
        }));
        
        setStreamingMessage({ content: '', isStreaming: true });
        
        const requestBody: any = {
          projectId,
          databaseId: databaseId || null,
          connectionId: connectionId || null,
          shareToken: shareToken || null,
          sessionId: currentSessionId,
          iteration: currentIteration,
          maxIterations,
        };
        
        // Only include full context on first iteration
        if (currentIteration === 1) {
          requestBody.taskDescription = userMessageContent;
          requestBody.exposeProject = agentConfig.exposeProject;
          // Include schema context
          requestBody.schemaContext = schemas.map(s => ({
            name: s.name,
            tables: s.tables,
            views: s.views,
            functions: s.functions
          }));
          // Include attached project context
          if (attachedContext) {
            requestBody.projectContext = {
              projectMetadata: attachedContext.projectMetadata || null,
              artifacts: attachedContext.artifacts?.length > 0 ? attachedContext.artifacts : undefined,
              requirements: attachedContext.requirements?.length > 0 ? attachedContext.requirements : undefined,
              standards: attachedContext.standards?.length > 0 ? attachedContext.standards : undefined,
              techStacks: attachedContext.techStacks?.length > 0 ? attachedContext.techStacks : undefined,
              canvasNodes: attachedContext.canvasNodes?.length > 0 ? attachedContext.canvasNodes : undefined,
              canvasEdges: attachedContext.canvasEdges?.length > 0 ? attachedContext.canvasEdges : undefined,
              files: attachedContext.files?.length > 0 ? attachedContext.files : undefined,
              databases: attachedContext.databases?.length > 0 ? attachedContext.databases : undefined,
              chatSessions: attachedContext.chatSessions?.length > 0 ? attachedContext.chatSessions : undefined,
            };
          }
        }
        
        const response = await fetch(`${supabaseUrl}/functions/v1/database-agent-orchestrator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Request failed: ${response.status} - ${errorText}`);
        }
        
        // Parse SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        if (reader) {
          let receivedIterationComplete = false;
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                  const data = JSON.parse(line.slice(6));
                  switch (data.type) {
                    case 'session_created':
                      currentSessionId = data.sessionId;
                      break;
                    case 'llm_streaming':
                      setStreamProgress(p => ({ 
                        ...p, 
                        charsReceived: data.charsReceived,
                        streamingContent: p.streamingContent + (data.delta || '')
                      }));
                      setStreamingMessage(prev => ({
                        content: (prev?.content || '') + (data.delta || ''),
                        isStreaming: true
                      }));
                      break;
                    case 'operation_start':
                      setStreamProgress(p => ({ 
                        ...p, 
                        currentOperation: data.operation, 
                        status: 'processing' 
                      }));
                      break;
                    case 'operation_complete':
                      setStreamProgress(p => ({ ...p, currentOperation: null }));
                      // DON'T refresh schema during stream - defer to after iteration completes
                      // to prevent connection drops
                      break;
                    case 'iteration_complete':
                      status = data.status;
                      currentSessionId = data.sessionId;
                      receivedIterationComplete = true;
                      // Don't clear streaming message here - let real-time sync handle it
                      break;
                    case 'error':
                      throw new Error(data.error);
                  }
                } catch (e) {
                  if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
                    throw e;
                  }
                }
              }
            }
          } catch (streamError: any) {
            console.error('Stream read error:', streamError);
            
            // If user clicked stop or abort was triggered, break out of loop
            if (streamError.name === 'AbortError' || isStoppingRef.current) {
              console.log('Stream aborted by user');
              isStoppingRef.current = false;
              break;
            }
            
            // Only retry for unintentional interruptions
            if (!receivedIterationComplete && status === 'in_progress') {
              console.warn(`Stream interrupted at iteration ${currentIteration}, will retry...`);
              toast.warning(`Iteration ${currentIteration} interrupted, retrying...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              continue;
            }
            throw streamError;
          }
          
          if (!receivedIterationComplete && status === 'in_progress') {
            console.warn(`Stream ended without iteration_complete at iteration ${currentIteration}`);
            if (currentIteration >= 3) {
              toast.warning('Agent stream interrupted. Session may be incomplete.');
              break;
            }
            continue;
          }
        }
        
        currentIteration++;
      }
      
      setStreamProgress(p => ({ ...p, status: 'complete' }));
      toast.success('Database Agent task completed');
      // Don't refetch - real-time subscription handles message sync
      onSchemaRefresh();
      if (onMigrationRefresh) onMigrationRefresh();
      
    } catch (error: any) {
      console.error('Error submitting task:', error);
      if (error.name === 'AbortError' || error.message?.includes('cancelled')) {
        toast.info('Task cancelled');
      } else {
        toast.error(`Failed to submit task: ${error.message}`);
      }
      setMessages(previousMessages);
    } finally {
      setIsSubmitting(false);
      setStreamProgress(p => ({ ...p, status: 'idle' }));
      abortControllerRef.current = null;
    }
  };
  
  const handleStop = async () => {
    if (abortControllerRef.current) {
      isStoppingRef.current = true;  // Mark as intentional stop
      abortControllerRef.current.abort();
      
      // Call server-side abort RPC
      const lastAgentMessage = messages.find((m: any) => m.session_id && !m.session_id.startsWith('temp'));
      if (lastAgentMessage?.session_id) {
        try {
          await supabase.rpc('request_agent_session_abort_with_token', {
            p_session_id: lastAgentMessage.session_id,
            p_token: shareToken || null,
          });
        } catch (e) {
          console.error('Failed to request abort:', e);
        }
      }
      
      setIsSubmitting(false);
      setStreamingMessage(null);
      abortControllerRef.current = null;
      toast.info('Agent stopped');
    }
  };
  
  const getOperationIcon = (opType: string) => {
    if (opType?.includes('schema') || opType?.includes('read_database')) return <Database className="h-4 w-4" />;
    if (opType?.includes('table')) return <Table2 className="h-4 w-4" />;
    if (opType?.includes('sql') || opType?.includes('execute')) return <Code className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };
  
  // Parse agent content to extract reasoning and operations
  const parseAgentContent = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      let operations = parsed.operations || [];
      if (typeof operations === 'string') {
        try { operations = JSON.parse(operations); } catch { operations = []; }
      }
      if (!Array.isArray(operations)) operations = [];
      
      return {
        reasoning: parsed.reasoning || '',
        operations,
        status: parsed.status || '',
      };
    } catch {
      return { reasoning: content, operations: [], status: '' };
    }
  };
  
  const renderMessage = (message: any, index: number) => {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    
    if (isSystem) return null; // Hide system messages
    
    // Parse agent message content for reasoning and operations
    const parsed = !isUser ? parseAgentContent(message.content) : null;
    const displayContent = parsed?.reasoning || message.content;
    
    return (
      <div
        key={message.id}
        className={`flex gap-3 p-3 ${isUser ? 'bg-muted/30' : 'bg-background'}`}
        data-timeline-id={message.id}
      >
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-primary/10' : 'bg-accent'}`}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium">{isUser ? 'You' : 'Database Agent'}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(message.created_at).toLocaleTimeString()}
            </span>
          </div>
          
          {/* Reasoning text */}
          <div className="text-sm whitespace-pre-wrap break-words">
            {displayContent}
          </div>
          
          {/* Tool calls / Operations */}
          {parsed && parsed.operations.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Operations:</p>
              {parsed.operations.map((op: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-xs bg-muted/50 px-2 py-1 rounded">
                  {getOperationIcon(op.type)}
                  <Badge variant="outline" className="text-xs">{op.type}</Badge>
                  <span className="text-muted-foreground truncate flex-1">
                    {op.params?.table_name || op.params?.sql?.slice(0, 60) || JSON.stringify(op.params || {}).slice(0, 60)}
                  </span>
                </div>
              ))}
            </div>
          )}
          
          {/* Status badge */}
          {parsed?.status && parsed.status !== 'in_progress' && (
            <Badge 
              variant={parsed.status === 'completed' ? 'default' : 'outline'} 
              className="mt-2 text-xs"
            >
              {parsed.status === 'completed' ? <CheckCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
              {parsed.status}
            </Badge>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="h-full flex flex-col bg-card">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Database Agent</span>
          {streamProgress.status !== 'idle' && (
            <Badge variant="outline" className="text-xs">
              {streamProgress.status === 'streaming' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {streamProgress.status === 'processing' && <Zap className="h-3 w-3 mr-1" />}
              {streamProgress.status === 'complete' && <CheckCircle className="h-3 w-3 mr-1" />}
              Iteration {streamProgress.iteration}/{streamProgress.maxIterations}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveTab(activeTab === 'chat' ? 'prompt' : 'chat')}
            className="h-6 w-6"
            title="Configure Prompt"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
          {onCollapse && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCollapse}
              className="h-6 w-6"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'chat' | 'prompt' | 'logs')} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-3 mb-2 grid w-auto grid-cols-3">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="prompt">Prompt</TabsTrigger>
          <TabsTrigger value="logs">Raw Logs</TabsTrigger>
        </TabsList>
        
        <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden m-0">
          <ScrollArea className="flex-1" ref={scrollViewportRef}>
            <div className="min-h-full">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 && !streamingMessage ? (
                <div className="flex flex-col items-center justify-center h-32 p-4 text-center">
                  <Database className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Ask the Database Agent to help manage your database
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    e.g., "Create a users table with email and password columns"
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {messages.map(renderMessage)}
                  
                  {/* Streaming message */}
                  {streamingMessage?.isStreaming && (
                    <div className="flex gap-3 p-3 bg-accent/30">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-accent">
                        <Bot className="h-4 w-4 animate-pulse" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium">Database Agent</span>
                          <Badge variant="outline" className="text-xs">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Thinking...
                          </Badge>
                        </div>
                        <div className="text-sm whitespace-pre-wrap break-words">
                          {parseStreamingContent(streamingMessage.content)}
                          <span className="inline-block w-2 h-4 bg-primary/50 ml-0.5 animate-pulse" />
                        </div>
                        {streamProgress.currentOperation && (
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            {getOperationIcon(streamProgress.currentOperation)}
                            <span>Executing: {streamProgress.currentOperation}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          
          {/* Input area - Stacked Layout */}
          <div className="p-3 border-t border-border space-y-2">
            {/* Context Attachment Display */}
            {attachedContext && totalAttachments > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                <Paperclip className="h-4 w-4" />
                <span>{totalAttachments} context item(s) attached</span>
                <button
                  onClick={() => setAttachedContext(null)}
                  className="ml-auto hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Button Row */}
            <div className="flex justify-between items-center">
              {/* Left buttons: History, Attach, Config */}
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsSettingsOpen(true)}
                  disabled={isSubmitting}
                  title="Chat History Settings"
                  className={`h-8 w-8 ${chatHistorySettings.includeHistory ? "border-primary text-primary" : ""}`}
                >
                  <BookOpen className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsProjectSelectorOpen(true)}
                  disabled={isSubmitting}
                  title="Attach Context"
                  className={`h-8 w-8 ${totalAttachments > 0 ? "border-primary text-primary" : ""}`}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsAgentConfigOpen(true)}
                  disabled={isSubmitting}
                  title="Agent Configuration"
                  className={`h-8 w-8 ${agentConfig.exposeProject ? "border-primary text-primary" : ""}`}
                >
                  <Sliders className="h-4 w-4" />
                </Button>
              </div>

              {/* Right button: Send/Stop */}
              <Button
                onClick={isSubmitting ? handleStop : handleSubmit}
                disabled={!isSubmitting && (!taskInput.trim() || (!databaseId && !connectionId))}
                size="icon"
                variant={isSubmitting ? "destructive" : "default"}
                className="h-8 w-8"
              >
                {isSubmitting ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>

            {/* Full-width textarea */}
            <Textarea
              placeholder="Describe what you want to do with the database..."
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={isSubmitting}
              className="min-h-[60px] w-full resize-none text-sm"
            />

            {/* Stream progress indicator */}
            {streamProgress.status !== 'idle' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {streamProgress.status === 'streaming' && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Receiving: {streamProgress.charsReceived} chars</span>
                  </>
                )}
                {streamProgress.status === 'processing' && streamProgress.currentOperation && (
                  <>
                    <Zap className="h-3 w-3" />
                    <span>Executing: {streamProgress.currentOperation}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="prompt" className="flex-1 overflow-hidden m-0">
          <AgentPromptEditor
            projectId={projectId}
            shareToken={shareToken}
            agentType="database-agent-orchestrator"
          />
        </TabsContent>
        
        <TabsContent value="logs" className="flex-1 overflow-hidden m-0 p-3">
          <RawLLMLogsViewer
            projectId={projectId}
            shareToken={shareToken}
            agentType="database"
          />
        </TabsContent>
      </Tabs>
      
      {/* Agent Configuration Modal */}
      <AgentConfigurationModal
        open={isAgentConfigOpen}
        onOpenChange={setIsAgentConfigOpen}
        config={agentConfig}
        onConfigChange={setAgentConfig}
      />
      
      {/* Project Selector Dialog */}
      <ProjectSelector
        open={isProjectSelectorOpen}
        onClose={() => setIsProjectSelectorOpen(false)}
        onConfirm={handleContextAttachment}
        projectId={projectId}
        shareToken={shareToken}
      />

      {/* Chat History Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chat History Settings</DialogTitle>
            <DialogDescription>
              Configure how chat history is included and download agent logs.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="include-history" 
                checked={chatHistorySettings.includeHistory}
                onCheckedChange={(checked) => 
                  setChatHistorySettings(prev => ({ ...prev, includeHistory: checked as boolean }))
                }
              />
              <Label htmlFor="include-history" className="text-sm font-medium">
                Include recent chat history with submissions
              </Label>
            </div>
            
            {/* Download section */}
            <div className="pt-4 border-t">
              <Label className="text-sm font-medium">Download Chat History</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Export complete agent chat history for review.
              </p>
              <Button 
                variant="outline" 
                onClick={handleDownloadChatHistory}
                disabled={isDownloadingHistory}
                className="w-full"
              >
                {isDownloadingHistory ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Download History (JSON)
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}