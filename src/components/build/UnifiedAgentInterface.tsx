import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  Bot, 
  Loader2, 
  Send, 
  Paperclip,
  FileText,
  FilePlus,
  FileEdit,
  FileX,
  FolderSearch,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  GitCommit,
  ChevronDown
} from 'lucide-react';
import { useInfiniteAgentMessages } from '@/hooks/useInfiniteAgentMessages';
import { useInfiniteAgentOperations } from '@/hooks/useInfiniteAgentOperations';
import { ProjectSelector, ProjectSelectionResult } from '@/components/project/ProjectSelector';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface UnifiedAgentInterfaceProps {
  projectId: string;
  repoId: string | null;
  shareToken: string | null;
  attachedFiles: Array<{ id: string; path: string }>;
  onRemoveFile: (fileId: string) => void;
}

export function UnifiedAgentInterface({ 
  projectId, 
  repoId, 
  shareToken,
  attachedFiles,
  onRemoveFile
}: UnifiedAgentInterfaceProps) {
  const { messages: loadedMessages, loading: messagesLoading, hasMore: hasMoreMessages, loadMore: loadMoreMessages, refetch: refetchMessages } = useInfiniteAgentMessages(projectId, shareToken);
  const { operations, loading: operationsLoading, hasMore: hasMoreOperations, loadMore: loadMoreOperations, refetch: refetchOperations } = useInfiniteAgentOperations(projectId, shareToken);
  
  // Local messages state for optimistic updates
  const [messages, setMessages] = useState<any[]>(loadedMessages);
  
  const [taskInput, setTaskInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoCommit, setAutoCommit] = useState(false);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [attachedContext, setAttachedContext] = useState<ProjectSelectionResult | null>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const messageObserverRef = useRef<IntersectionObserver | null>(null);
  const operationObserverRef = useRef<IntersectionObserver | null>(null);
  const messageLoadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const operationLoadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Sync loaded messages with local state
  useEffect(() => {
    setMessages(loadedMessages);
  }, [loadedMessages]);

  // Combine messages and operations into a unified timeline
  const timeline = [...messages, ...operations].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Auto-scroll detection (like Chat.tsx)
  useEffect(() => {
    const scrollArea = scrollViewportRef.current;
    if (!scrollArea) return;

    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const threshold = 100;
      const isAtBottom = distanceFromBottom < threshold;
      setIsAutoScrollEnabled(isAtBottom);
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll when new content arrives
  useEffect(() => {
    if (isAutoScrollEnabled && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [timeline.length, isAutoScrollEnabled]);

  // Intersection observer for infinite scroll (messages)
  useEffect(() => {
    if (messagesLoading || !hasMoreMessages) return;

    messageObserverRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreMessages();
        }
      },
      { threshold: 0.1 }
    );

    if (messageLoadMoreTriggerRef.current) {
      messageObserverRef.current.observe(messageLoadMoreTriggerRef.current);
    }

    return () => {
      if (messageObserverRef.current) {
        messageObserverRef.current.disconnect();
      }
    };
  }, [messagesLoading, hasMoreMessages, loadMoreMessages]);

  // Intersection observer for operations (if needed separately)
  useEffect(() => {
    if (operationsLoading || !hasMoreOperations) return;

    operationObserverRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreOperations();
        }
      },
      { threshold: 0.1 }
    );

    if (operationLoadMoreTriggerRef.current) {
      operationObserverRef.current.observe(operationLoadMoreTriggerRef.current);
    }

    return () => {
      if (operationObserverRef.current) {
        operationObserverRef.current.disconnect();
      }
    };
  }, [operationsLoading, hasMoreOperations, loadMoreOperations]);

  const handleSubmit = async () => {
    if (!taskInput.trim() || isSubmitting || !repoId) {
      if (!repoId) {
        toast.error('No repository selected');
      }
      return;
    }

    const userMessageContent = taskInput;
    setIsSubmitting(true);
    setTaskInput(''); // Clear input immediately
    setIsAutoScrollEnabled(true); // Enable auto-scroll for new message

    // Add optimistic user message to timeline immediately
    const optimisticUserMessage = {
      id: `temp-${Date.now()}`,
      session_id: "temp",
      role: "user",
      content: userMessageContent,
      metadata: {},
      created_at: new Date().toISOString(),
    };
 
    // Temporarily add to messages state for immediate display
    const previousMessages = messages;
    setMessages((prev: any[]) => [...prev, optimisticUserMessage]);

    // Immediately scroll to the new message
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }, 0);


    try {
      const { error } = await supabase.functions.invoke('coding-agent-orchestrator', {
        body: {
          projectId,
          repoId,
          shareToken: shareToken || null,
          taskDescription: userMessageContent,
          mode: 'task', // Required parameter - can be 'task', 'iterative_loop', or 'continuous_improvement'
          autoCommit,
          attachedFiles: attachedFiles, // Pass full objects with id and path
          projectContext: attachedContext ? {
            projectMetadata: attachedContext.projectMetadata || null,
            artifacts: attachedContext.artifacts.length > 0 ? attachedContext.artifacts : undefined,
            requirements: attachedContext.requirements.length > 0 ? attachedContext.requirements : undefined,
            standards: attachedContext.standards.length > 0 ? attachedContext.standards : undefined,
            techStacks: attachedContext.techStacks.length > 0 ? attachedContext.techStacks : undefined,
            canvasNodes: attachedContext.canvasNodes.length > 0 ? attachedContext.canvasNodes : undefined,
            canvasEdges: attachedContext.canvasEdges.length > 0 ? attachedContext.canvasEdges : undefined,
          } : {},
        },
      });

      if (error) throw error;

      toast.success('Agent task submitted');

      // Refresh messages and operations so the real user message and agent work replace optimistic one
      refetchMessages();
      refetchOperations();
    } catch (error) {
      console.error('Error submitting task:', error);
      toast.error('Failed to submit task');
      // Rollback optimistic update on error
      setMessages(previousMessages);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContextAttachment = (selection: ProjectSelectionResult) => {
    setAttachedContext(selection);
    setIsProjectSelectorOpen(false);
    const count = 
      (selection.artifacts?.length || 0) +
      (selection.requirements?.length || 0) +
      (selection.standards?.length || 0) +
      (selection.techStacks?.length || 0) +
      (selection.canvasNodes?.length || 0);
    toast.success(`Attached ${count} context items`);
  };

  const getOperationIcon = (type: string, status: string) => {
    if (status === "in_progress") return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
    if (status === "completed") {
      switch (type) {
        case "create":
          return <FilePlus className="h-4 w-4 text-green-500" />;
        case "edit":
          return <FileEdit className="h-4 w-4 text-blue-500" />;
        case "delete":
          return <FileX className="h-4 w-4 text-red-500" />;
        case "search":
          return <FolderSearch className="h-4 w-4 text-purple-500" />;
        default:
          return <FileText className="h-4 w-4 text-muted-foreground" />;
      }
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
      case "in_progress":
        return <Badge variant="default" className="bg-yellow-500">In Progress</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const formatDuration = (createdAt: string, completedAt: string | null) => {
    if (!completedAt) return null;
    const duration = new Date(completedAt).getTime() - new Date(createdAt).getTime();
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    return `${(duration / 60000).toFixed(1)}m`;
  };

  const renderOperationDetails = (details: any) => {
    if (!details || Object.keys(details).length === 0) return null;

    return (
      <div className="mt-2 pt-2 border-t border-border/50">
        <div className="flex flex-wrap gap-2">
          {details.lines_changed && (
            <Badge variant="outline" className="text-xs">
              <GitCommit className="h-3 w-3 mr-1" />
              {details.lines_changed} lines
            </Badge>
          )}
          {details.files_found && (
            <Badge variant="outline" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              {details.files_found} files found
            </Badge>
          )}
          {details.reason && (
            <p className="text-xs text-muted-foreground w-full mt-1">
              {details.reason}
            </p>
          )}
          {details.search_keyword && (
            <Badge variant="outline" className="text-xs">
              <FolderSearch className="h-3 w-3 mr-1" />
              "{details.search_keyword}"
            </Badge>
          )}
        </div>
      </div>
    );
  };

  const parseAgentContent = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      return {
        reasoning: parsed.reasoning || '',
        operations: parsed.operations || [],
        status: parsed.status || '',
      };
    } catch {
      return { reasoning: content, operations: [], status: '' };
    }
  };

  const renderTimelineItem = (item: any, index: number) => {
    const isMessage = 'role' in item;
    const isOperation = 'operation_type' in item;
    const isLastUserMessage = index === timeline.length - 1 && isMessage && item.role === 'user';

    if (isMessage) {
      const isUser = item.role === 'user';
      const isAgent = item.role === 'agent';

      if (isUser) {
        return (
          <div 
            key={item.id} 
            ref={isLastUserMessage ? lastUserMessageRef : null}
            className="flex gap-3"
          >
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold">You</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-sm whitespace-pre-wrap">{item.content}</p>
              </div>
            </div>
          </div>
        );
      }

      if (isAgent) {
        const parsed = parseAgentContent(item.content);
        return (
          <div key={item.id} className="flex gap-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-secondary" />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-semibold">Agent</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleTimeString()}
                </span>
                {item.metadata?.iteration && (
                  <Badge variant="outline" className="text-xs">
                    Iteration {item.metadata.iteration}
                  </Badge>
                )}
                {parsed.status && (
                  <Badge 
                    variant={
                      parsed.status === 'completed' ? 'default' :
                      parsed.status === 'requires_commit' ? 'secondary' :
                      'outline'
                    }
                    className="text-xs"
                  >
                    {parsed.status}
                  </Badge>
                )}
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border">
                {parsed.reasoning && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold mb-1 text-muted-foreground">Reasoning:</p>
                    <p className="text-sm whitespace-pre-wrap">{parsed.reasoning}</p>
                  </div>
                )}
                {parsed.operations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2 text-muted-foreground">Operations:</p>
                    <div className="space-y-1">
                      {parsed.operations.map((op: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-xs">
                            {op.type}
                          </Badge>
                          <span className="text-muted-foreground">
                            {op.params?.path || op.params?.file_id || op.params?.keyword || 'N/A'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }
    }

    if (isOperation) {
      return (
        <div key={item.id} className="flex gap-3">
          <div className="flex-shrink-0">
            {getOperationIcon(item.operation_type, item.status)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-medium capitalize">
                {item.operation_type}
              </span>
              {getStatusBadge(item.status)}
              {item.completed_at && formatDuration(item.created_at, item.completed_at) && (
                <Badge variant="secondary" className="text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  {formatDuration(item.created_at, item.completed_at)}
                </Badge>
              )}
            </div>
            
            {item.file_path && (
              <p className="text-xs font-mono text-muted-foreground truncate bg-muted/30 px-2 py-1 rounded">
                {item.file_path}
              </p>
            )}
            
            {item.error_message && (
              <div className="text-xs text-destructive mt-1 bg-destructive/10 px-2 py-1 rounded">
                <pre className="whitespace-pre-wrap font-mono text-xs">{item.error_message}</pre>
              </div>
            )}

            {renderOperationDetails(item.details)}
            
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                {new Date(item.created_at).toLocaleTimeString()}
              </p>
              {item.completed_at && (
                <p className="text-xs text-muted-foreground">
                  → {new Date(item.completed_at).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const totalAttachments = 
    attachedFiles.length +
    (attachedContext?.artifacts?.length || 0) +
    (attachedContext?.requirements?.length || 0) +
    (attachedContext?.standards?.length || 0) +
    (attachedContext?.techStacks?.length || 0) +
    (attachedContext?.canvasNodes?.length || 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Timeline */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <ScrollArea className="h-full" ref={scrollViewportRef}>
          <div className="p-4 space-y-4">
            {timeline.length === 0 && !messagesLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground py-8">
                <p className="text-sm">No activity yet. Submit a task to get started.</p>
              </div>
            ) : (
              <>
                {/* Load more triggers at TOP for scrolling up */}
                {(hasMoreMessages || hasMoreOperations) && (
                  <div ref={messageLoadMoreTriggerRef} className="flex items-center justify-center py-4">
                    {(messagesLoading || operationsLoading) ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <p className="text-xs text-muted-foreground">Scroll up for older messages...</p>
                    )}
                  </div>
                )}
                
                {timeline.map((item, index) => renderTimelineItem(item, index))}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Scroll to bottom button */}
        {!isAutoScrollEnabled && (
          <Button
            variant="outline"
            size="icon"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full h-10 w-10 shadow-lg z-10 bg-background hover:bg-accent"
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              setIsAutoScrollEnabled(true);
            }}
          >
            <ChevronDown className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t p-4 space-y-3 bg-background">
        {/* Attached Files Display */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachedFiles.map((file) => (
              <Badge key={file.id} variant="secondary" className="gap-1">
                <FileText className="h-3 w-3" />
                {file.path.split('/').pop()}
                <button
                  onClick={() => onRemoveFile(file.id)}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Context Attachment Display */}
        {attachedContext && totalAttachments > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Paperclip className="h-4 w-4" />
            <span>{totalAttachments} context item(s) attached</span>
            <button
              onClick={() => setAttachedContext(null)}
              className="ml-auto text-xs hover:text-destructive"
            >
              Clear
            </button>
          </div>
        )}

        {/* Auto-commit Toggle */}
        <div className="flex items-center gap-2">
          <Checkbox 
            id="auto-commit" 
            checked={autoCommit}
            onCheckedChange={(checked) => setAutoCommit(checked as boolean)}
          />
          <Label htmlFor="auto-commit" className="text-sm">
            Auto-commit and push changes
          </Label>
        </div>

        {/* Task Input */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsProjectSelectorOpen(true)}
            disabled={isSubmitting}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            placeholder="Describe the task for the agent..."
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={isSubmitting}
            className="min-h-[60px]"
          />
          <Button
            onClick={handleSubmit}
            disabled={!taskInput.trim() || isSubmitting || !repoId}
            size="icon"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Project Selector Dialog */}
      <ProjectSelector
        open={isProjectSelectorOpen}
        onClose={() => setIsProjectSelectorOpen(false)}
        onConfirm={handleContextAttachment}
        projectId={projectId}
        shareToken={shareToken}
      />
    </div>
  );
}
