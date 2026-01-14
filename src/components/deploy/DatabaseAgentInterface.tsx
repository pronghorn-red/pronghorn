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
  Settings
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useInfiniteAgentMessages } from '@/hooks/useInfiniteAgentMessages';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentPromptEditor } from '@/components/build/AgentPromptEditor';

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
  const { messages: loadedMessages, loading: messagesLoading, refetch: refetchMessages } = useInfiniteAgentMessages(projectId, shareToken);
  
  const [messages, setMessages] = useState<any[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'prompt'>('chat');
  
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
  
  // Helper function to parse streaming content and extract readable text
  const parseStreamingContent = (content: string): string => {
    try {
      if (content.trim().startsWith('{')) {
        const reasoningMatch = content.match(/"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
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
    return content;
  };
  
  // Sync loaded messages with local state
  useEffect(() => {
    // Filter to only database agent messages (mode = 'database')
    const dbMessages = loadedMessages.filter((m: any) => 
      m.metadata?.mode === 'database' || 
      m.session_id?.includes('database') ||
      true // For now, show all project messages - we'll refine this later
    );
    setMessages(dbMessages);
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
  
  // Auto-scroll when streaming
  useEffect(() => {
    if (isAutoScrollEnabled && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isAutoScrollEnabled]);
  
  const handleSubmit = async () => {
    if (!taskInput.trim() || isSubmitting) return;
    if (!databaseId && !connectionId) {
      toast.error('No database selected');
      return;
    }
    
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
      const maxIterations = 50;
      
      while (status === 'in_progress' && currentIteration <= maxIterations) {
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
          // Include schema context
          requestBody.schemaContext = schemas.map(s => ({
            name: s.name,
            tables: s.tables,
            views: s.views,
            functions: s.functions
          }));
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
                      // Refresh schema after operations complete
                      onSchemaRefresh();
                      if (onMigrationRefresh) onMigrationRefresh();
                      break;
                    case 'iteration_complete':
                      status = data.status;
                      currentSessionId = data.sessionId;
                      receivedIterationComplete = true;
                      setStreamingMessage(null);
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
          } catch (streamError) {
            console.error('Stream read error:', streamError);
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
      refetchMessages();
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
  
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsSubmitting(false);
      abortControllerRef.current = null;
      toast.info('Stopping agent...');
    }
  };
  
  const getOperationIcon = (opType: string) => {
    if (opType?.includes('schema') || opType?.includes('read_database')) return <Database className="h-4 w-4" />;
    if (opType?.includes('table')) return <Table2 className="h-4 w-4" />;
    if (opType?.includes('sql') || opType?.includes('execute')) return <Code className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };
  
  const renderMessage = (message: any, index: number) => {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    
    if (isSystem) return null; // Hide system messages
    
    // Try to parse agent message content
    let displayContent = message.content;
    let reasoning = '';
    
    if (!isUser && message.content) {
      try {
        const parsed = JSON.parse(message.content);
        reasoning = parsed.reasoning || '';
        displayContent = reasoning || message.content;
      } catch {
        displayContent = message.content;
      }
    }
    
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
          <div className="text-sm whitespace-pre-wrap break-words">
            {displayContent}
          </div>
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
      
      {activeTab === 'chat' ? (
        <>
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
          
          {/* Input area */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
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
                className="min-h-[60px] max-h-[120px] resize-none text-sm"
              />
              <div className="flex flex-col gap-1">
                {isSubmitting ? (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={handleStop}
                    className="h-8 w-8"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    onClick={handleSubmit}
                    disabled={!taskInput.trim() || (!databaseId && !connectionId)}
                    className="h-8 w-8"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {streamProgress.status !== 'idle' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
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
        </>
      ) : (
        <div className="flex-1 overflow-hidden">
          <AgentPromptEditor
            projectId={projectId}
            shareToken={shareToken}
            agentType="database-agent-orchestrator"
          />
        </div>
      )}
    </div>
  );
}
