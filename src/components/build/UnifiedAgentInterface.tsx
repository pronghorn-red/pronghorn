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
  ChevronDown,
  Settings,
  Square,
  BookOpen,
  Download,
  Wrench
} from 'lucide-react';
import { AgentConfigurationModal, AgentConfiguration } from './AgentConfigurationModal';
import { useInfiniteAgentMessages } from '@/hooks/useInfiniteAgentMessages';
import { useInfiniteAgentOperations } from '@/hooks/useInfiniteAgentOperations';
import { ProjectSelector, ProjectSelectionResult } from '@/components/project/ProjectSelector';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';

interface UnifiedAgentInterfaceProps {
  projectId: string;
  repoId: string | null;
  shareToken: string | null;
  attachedFiles: Array<{ id: string; path: string }>;
  onRemoveFile: (fileId: string) => void;
  onOpenSettings?: () => void;
  files?: Array<{ id: string; path: string; isStaged?: boolean }>;
  autoCommit: boolean;
  onAutoCommitChange: (checked: boolean) => void;
}

interface ChatHistorySettings {
  includeHistory: boolean;
  durationType: 'time' | 'messages';
  durationValue: number; // minutes if 'time', message count if 'messages'
  verbosity: 'minimal' | 'standard' | 'detailed';
  showBlackboard: boolean;
}

export function UnifiedAgentInterface({ 
  projectId, 
  repoId, 
  shareToken,
  attachedFiles,
  onRemoveFile,
  onOpenSettings,
  files = [],
  autoCommit,
  onAutoCommitChange
}: UnifiedAgentInterfaceProps) {
  const { messages: loadedMessages, loading: messagesLoading, hasMore: hasMoreMessages, loadMore: loadMoreMessages, refetch: refetchMessages } = useInfiniteAgentMessages(projectId, shareToken);
  const { operations, loading: operationsLoading, hasMore: hasMoreOperations, loadMore: loadMoreOperations, refetch: refetchOperations } = useInfiniteAgentOperations(projectId, shareToken);
  
  // Local messages state for optimistic updates
  const [messages, setMessages] = useState<any[]>(loadedMessages);
  
  const [taskInput, setTaskInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [attachedContext, setAttachedContext] = useState<ProjectSelectionResult | null>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  
  // Chat history settings state
  const [chatHistorySettings, setChatHistorySettings] = useState<ChatHistorySettings>({
    includeHistory: true,
    durationType: 'time',
    durationValue: 20, // Default 20 minutes
    verbosity: 'standard',
    showBlackboard: false,
  });
  
  // Helper function to resolve file IDs to paths
  const resolveFileId = (fileId: string | undefined): string => {
    if (!fileId) return 'N/A';
    const file = files.find(f => f.id === fileId);
    return file?.path || fileId; // Return path if found, fallback to ID
  };
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDownloadingHistory, setIsDownloadingHistory] = useState(false);
  const [isAgentConfigOpen, setIsAgentConfigOpen] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentConfiguration>({
    exposeProject: false,
    maxIterations: 30,
  });
  
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const messageObserverRef = useRef<IntersectionObserver | null>(null);
  const operationObserverRef = useRef<IntersectionObserver | null>(null);
  const messageLoadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const operationLoadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const anchorIdBeforeLoad = useRef<string | null>(null);
  const anchorOffsetBeforeLoad = useRef<number>(0);

  // Detect when component becomes visible (for mobile tab switching)
  useEffect(() => {
    const container = scrollViewportRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        // Scroll to bottom when becoming visible
        if (entry.isIntersecting && messagesEndRef.current) {
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
          }, 100);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Sync loaded messages with local state
  useEffect(() => {
    setMessages(loadedMessages);
  }, [loadedMessages]);

  // Scroll to bottom when messages first load
  const hasInitiallyScrolled = useRef(false);
  useEffect(() => {
    if (!messagesLoading && loadedMessages.length > 0 && !hasInitiallyScrolled.current) {
      hasInitiallyScrolled.current = true;
      // Use a longer timeout to ensure DOM is fully rendered
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 150);
    }
  }, [messagesLoading, loadedMessages.length]);

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
          // Find the first timeline item that's visible in viewport and store its ID
          const viewport = scrollViewportRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
          if (viewport) {
            const viewportRect = viewport.getBoundingClientRect();
            const timelineItems = viewport.querySelectorAll('[data-timeline-id]');
            
            for (const item of timelineItems) {
              const itemRect = item.getBoundingClientRect();
              // Find first item that's at least partially visible in the viewport
              if (itemRect.top >= viewportRect.top && itemRect.top < viewportRect.bottom) {
                anchorIdBeforeLoad.current = item.getAttribute('data-timeline-id');
                // Store the offset from viewport top to restore exact position later
                anchorOffsetBeforeLoad.current = itemRect.top - viewportRect.top;
                break;
              }
            }
          }
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

  // Restore scroll position after lazy load by scrolling to the anchor element with offset
  useEffect(() => {
    if (anchorIdBeforeLoad.current) {
      const anchorId = anchorIdBeforeLoad.current;
      const savedOffset = anchorOffsetBeforeLoad.current;
      // Use setTimeout to ensure DOM has fully updated after render
      setTimeout(() => {
        const viewport = scrollViewportRef.current?.querySelector(
          '[data-radix-scroll-area-viewport]'
        ) as HTMLElement;
        const anchorElement = scrollViewportRef.current?.querySelector(
          `[data-timeline-id="${anchorId}"]`
        ) as HTMLElement;
        
        if (anchorElement && viewport) {
          const viewportRect = viewport.getBoundingClientRect();
          const anchorRect = anchorElement.getBoundingClientRect();
          // Calculate current offset and adjust to restore original offset
          const currentOffset = anchorRect.top - viewportRect.top;
          const adjustment = currentOffset - savedOffset;
          viewport.scrollTop += adjustment;
        }
        anchorIdBeforeLoad.current = null;
      }, 50);
    }
  }, [timeline.length]);

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

  const retrieveChatHistory = async (): Promise<string> => {
    if (!chatHistorySettings.includeHistory) return '';

    try {
      // Build RPC params based on filter type
      const rpcParams: {
        p_project_id: string;
        p_token: string | null;
        p_limit?: number;
        p_since?: string;
      } = {
        p_project_id: projectId,
        p_token: shareToken || null,
      };

      if (chatHistorySettings.durationType === 'time') {
        // Time-based filtering
        const cutoffTime = new Date();
        cutoffTime.setMinutes(cutoffTime.getMinutes() - chatHistorySettings.durationValue);
        rpcParams.p_since = cutoffTime.toISOString();
      } else {
        // Message count filtering
        rpcParams.p_limit = chatHistorySettings.durationValue;
      }

      const { data: historyMessages, error } = await supabase.rpc(
        'get_agent_messages_with_token',
        rpcParams
      );

      if (error) throw error;
      if (!historyMessages || historyMessages.length === 0) return '';

      // Format chat history as text (messages are returned DESC, reverse to oldest first)
      const formattedHistory = historyMessages
        .reverse()
        .map((msg: any) => {
          const timestamp = new Date(msg.created_at).toLocaleString();
          if (msg.role === 'user') {
            return `[${timestamp}] User: ${msg.content}`;
          } else {
            // Parse agent content if JSON
            try {
              const parsed = JSON.parse(msg.content);
              return `[${timestamp}] Agent Reasoning: ${parsed.reasoning || msg.content}`;
            } catch {
              return `[${timestamp}] Agent: ${msg.content}`;
            }
          }
        })
        .join('\n\n');

      return `\n\n--- RECENT CHAT HISTORY (Last ${chatHistorySettings.durationValue} ${chatHistorySettings.durationType === 'time' ? 'minutes' : 'messages'}) ---\n${formattedHistory}\n--- END CHAT HISTORY ---\n\n`;
    } catch (error) {
      console.error('Error retrieving chat history:', error);
      toast.error('Failed to retrieve chat history');
      return '';
    }
  };

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
      // Retrieve chat history if enabled
      const chatHistory = await retrieveChatHistory();

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      const { error } = await supabase.functions.invoke('coding-agent-orchestrator', {
        body: {
          projectId,
          repoId,
          shareToken: shareToken || null,
          taskDescription: userMessageContent,
          chatHistory: chatHistory || undefined,
          mode: 'task',
          autoCommit,
          attachedFiles: attachedFiles,
          exposeProject: agentConfig.exposeProject,
          maxIterations: agentConfig.maxIterations,
          projectContext: attachedContext ? {
            projectMetadata: attachedContext.projectMetadata || null,
            artifacts: attachedContext.artifacts.length > 0 ? attachedContext.artifacts : undefined,
            requirements: attachedContext.requirements.length > 0 ? attachedContext.requirements : undefined,
            standards: attachedContext.standards.length > 0 ? attachedContext.standards : undefined,
            techStacks: attachedContext.techStacks.length > 0 ? attachedContext.techStacks : undefined,
            canvasNodes: attachedContext.canvasNodes.length > 0 ? attachedContext.canvasNodes : undefined,
            canvasEdges: attachedContext.canvasEdges.length > 0 ? attachedContext.canvasEdges : undefined,
            files: attachedContext.files?.length > 0 ? attachedContext.files : undefined,
            databases: attachedContext.databases?.length > 0 ? attachedContext.databases : undefined,
          } : {},
        },
        signal: abortControllerRef.current.signal,
      });

      if (error) {
        // Check if this was an abort
        if (error.message?.includes('aborted')) {
          throw new Error('Task cancelled by user');
        }
        throw error;
      }

      toast.success('Agent task completed');

      // Refresh messages and operations
      refetchMessages();
      refetchOperations();

      // Auto-commit and push if enabled
      if (autoCommit) {
        await performAutoCommitAndPush(userMessageContent);
      }
    } catch (error: any) {
      console.error('Error submitting task:', error);
      if (error.message?.includes('cancelled')) {
        toast.info('Task cancelled');
      } else {
        toast.error('Failed to submit task');
      }
      setMessages(previousMessages);
    } finally {
      setIsSubmitting(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      
      // Signal the edge function to stop by setting abort flag in database
      // Get the current session ID from the last message
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.metadata?.session_id) {
        try {
          const { error } = await supabase.rpc('request_agent_session_abort_with_token', {
            p_session_id: lastMessage.metadata.session_id,
            p_token: shareToken || null,
          });
          
          if (error) {
            console.error('Error requesting abort:', error);
          } else {
            console.log('Abort requested successfully');
          }
        } catch (error) {
          console.error('Failed to request abort:', error);
        }
      }
      
      setIsSubmitting(false);
      abortControllerRef.current = null;
      toast.info('Stopping agent...');
    }
  };

  const handleDownloadChatHistory = async () => {
    setIsDownloadingHistory(true);
    try {
      // Fetch ALL messages (using high limit)
      const { data: messagesData, error: messagesError } = await supabase.rpc(
        "get_agent_messages_with_token",
        {
          p_project_id: projectId,
          p_token: shareToken || null,
          p_limit: 100000,
          p_offset: 0,
        }
      );
      
      if (messagesError) throw messagesError;

      // Fetch ALL operations (using high limit)
      const { data: operationsData, error: operationsError } = await supabase.rpc(
        "get_agent_operations_by_project_with_token",
        {
          p_project_id: projectId,
          p_token: shareToken || null,
          p_limit: 100000,
          p_offset: 0,
        }
      );
      
      if (operationsError) throw operationsError;

      // Sort messages chronologically (oldest first for readability)
      const sortedMessages = (messagesData || []).sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      // Sort operations chronologically
      const sortedOperations = (operationsData || []).sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Build export object
      const exportData = {
        exportMetadata: {
          exportedAt: new Date().toISOString(),
          projectId: projectId,
          totalMessages: sortedMessages.length,
          totalOperations: sortedOperations.length,
        },
        messages: sortedMessages.map((msg: any) => ({
          id: msg.id,
          sessionId: msg.session_id,
          role: msg.role,
          content: msg.content,
          metadata: msg.metadata,
          createdAt: msg.created_at,
        })),
        operations: sortedOperations.map((op: any) => ({
          id: op.id,
          sessionId: op.session_id,
          operationType: op.operation_type,
          filePath: op.file_path,
          status: op.status,
          details: op.details,
          errorMessage: op.error_message,
          createdAt: op.created_at,
          completedAt: op.completed_at,
        })),
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `chat-history-${projectId}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Downloaded ${sortedMessages.length} messages and ${sortedOperations.length} operations`);
    } catch (error) {
      console.error("Error downloading chat history:", error);
      toast.error("Failed to download chat history");
    } finally {
      setIsDownloadingHistory(false);
    }
  };

  const performAutoCommitAndPush = async (taskDescription: string) => {
    if (!repoId) return;

    try {
      // 1. Check if there are staged changes
      const { data: stagedChanges, error: stagedError } = await supabase.rpc(
        'get_staged_changes_with_token',
        {
          p_repo_id: repoId,
          p_token: shareToken || null,
        }
      );

      if (stagedError) throw stagedError;
      if (!stagedChanges || stagedChanges.length === 0) {
        console.log('Auto-commit: No staged changes to commit');
        return;
      }

      // 2. Create commit message from task description
      const truncatedTask = taskDescription.length > 50 
        ? taskDescription.substring(0, 50) + '...' 
        : taskDescription;
      const commitMessage = `Auto-commit: ${truncatedTask}`;

      toast.info('Auto-committing changes...');

      // 3. Commit staged changes
      const { error: commitError } = await supabase.rpc('commit_staged_with_token', {
        p_repo_id: repoId,
        p_token: shareToken || null,
        p_commit_message: commitMessage,
        p_branch: 'main',
      });

      if (commitError) throw commitError;
      toast.success(`Committed ${stagedChanges.length} file(s)`);

      // 4. Get all repos for push (Prime + mirrors)
      const { data: repos, error: reposError } = await supabase.rpc(
        'get_project_repos_with_token',
        {
          p_project_id: projectId,
          p_token: shareToken || null,
        }
      );

      if (reposError) throw reposError;
      if (!repos || repos.length === 0) return;

      toast.info('Pushing to GitHub...');

      // 5. Find Prime repo and mirrors
      const primeRepo = repos.find((r: any) => r.is_prime) || repos[0];
      const mirrorRepos = repos.filter((r: any) => r.id !== primeRepo.id);

      // 6. Push to Prime repo
      const { error: pushError } = await supabase.functions.invoke('sync-repo-push', {
        body: {
          repoId: primeRepo.id,
          projectId,
          shareToken: shareToken || null,
          branch: primeRepo.branch,
          commitMessage,
          forcePush: false,
        },
      });

      if (pushError) {
        toast.error(`Failed to push to Prime: ${pushError.message}`);
        return;
      }

      // 7. Push to mirror repos (force push)
      for (const mirror of mirrorRepos) {
        await supabase.functions.invoke('sync-repo-push', {
          body: {
            repoId: mirror.id,
            sourceRepoId: primeRepo.id,
            projectId,
            shareToken: shareToken || null,
            branch: mirror.branch,
            commitMessage: `Mirror sync: ${commitMessage}`,
            forcePush: true,
          },
        });
      }

      const repoCount = mirrorRepos.length > 0 
        ? `Prime + ${mirrorRepos.length} mirror(s)` 
        : `${primeRepo.organization}/${primeRepo.repo}`;
      toast.success(`Pushed to ${repoCount}`);

    } catch (error: any) {
      console.error('Auto-commit/push failed:', error);
      toast.error(`Auto-commit failed: ${error.message}`);
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
      (selection.canvasNodes?.length || 0) +
      (selection.files?.length || 0);
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
        blackboardEntry: parsed.blackboard_entry || null,
      };
    } catch {
      return { reasoning: content, operations: [], status: '', blackboardEntry: null };
    }
  };

  const renderTimelineItem = (item: any, index: number, timelineArray: any[]) => {
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
            data-timeline-id={item.id}
            ref={isLastUserMessage ? lastUserMessageRef : null}
          >
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
        );
      }

      if (isAgent) {
        const parsed = parseAgentContent(item.content);
        const { verbosity } = chatHistorySettings;
        
        // Determine if this agent message should show reasoning in minimal mode
        // Show reasoning for: first agent after user input, OR last agent before user input/end
        const shouldShowReasoningInMinimal = (() => {
          // Look backwards to find if this is the first agent after a user message
          let isFirstAgentAfterUser = false;
          for (let i = index - 1; i >= 0; i--) {
            const prevItem = timelineArray[i];
            if ('role' in prevItem) {
              if (prevItem.role === 'user') {
                isFirstAgentAfterUser = true;
              }
              break;
            }
          }
          
          // Look forwards to find if this is the last agent before a user message or end
          let isLastAgentBeforeUserOrEnd = false;
          if (index === timelineArray.length - 1) {
            isLastAgentBeforeUserOrEnd = true;
          } else {
            let foundNextMessage = false;
            for (let i = index + 1; i < timelineArray.length; i++) {
              const nextItem = timelineArray[i];
              if ('role' in nextItem) {
                foundNextMessage = true;
                if (nextItem.role === 'user') {
                  isLastAgentBeforeUserOrEnd = true;
                }
                break;
              }
            }
            // If we searched to end and found no messages, this agent is the last one
            if (!foundNextMessage) {
              isLastAgentBeforeUserOrEnd = true;
            }
          }
          
          return isFirstAgentAfterUser || isLastAgentBeforeUserOrEnd;
        })();
        
        return (
          <div key={item.id} data-timeline-id={item.id}>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-semibold">Agent</span>
                {verbosity !== 'minimal' && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleTimeString()}
                  </span>
                )}
                {item.metadata?.iteration && (
                  <Badge variant="outline" className="text-xs">
                    Iteration {item.metadata.iteration}
                  </Badge>
                )}
                {verbosity !== 'minimal' && parsed.status && (
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
              {/* Only show content box if there's something to display */}
              {(verbosity === 'detailed' || 
                (verbosity === 'standard' && parsed.reasoning) || 
                parsed.operations.length > 0) && (
                <div className="p-3 rounded-lg bg-muted/30 border">
                  {/* DETAILED: Show raw JSON */}
                  {verbosity === 'detailed' && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold mb-1 text-muted-foreground">Raw Response:</p>
                      <pre className="text-xs bg-muted p-2 rounded max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                        {item.content}
                      </pre>
                    </div>
                  )}
                  
                  {/* STANDARD & DETAILED: Show reasoning (also show in minimal for first/last agent) */}
                  {(verbosity !== 'minimal' || shouldShowReasoningInMinimal) && parsed.reasoning && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold mb-1 text-muted-foreground">Reasoning:</p>
                      <p className="text-sm whitespace-pre-wrap">{parsed.reasoning}</p>
                    </div>
                  )}
                  
                  {/* BLACKBOARD ENTRY: Show when enabled and entry exists */}
                  {chatHistorySettings.showBlackboard && parsed.blackboardEntry && (
                    <div className="mb-3 p-2 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700">
                          {parsed.blackboardEntry.entry_type}
                        </Badge>
                        <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">Blackboard</p>
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-yellow-900 dark:text-yellow-100">
                        {parsed.blackboardEntry.content}
                      </p>
                    </div>
                  )}
                  
                  {/* ALL MODES: Show operations */}
                  {parsed.operations.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-2 text-muted-foreground">Operations:</p>
                      <div className="space-y-1">
                        {parsed.operations.map((op: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <Badge variant="outline" className="text-xs">
                              {op.type}
                            </Badge>
                            <span className="text-muted-foreground truncate max-w-[200px]" title={
                              op.params?.path || 
                              (verbosity === 'detailed' ? op.params?.file_id : resolveFileId(op.params?.file_id)) || 
                              op.params?.keyword || 
                              'N/A'
                            }>
                              {op.params?.path || 
                               (verbosity === 'detailed' ? op.params?.file_id : resolveFileId(op.params?.file_id)) || 
                               op.params?.keyword || 
                               'N/A'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
        );
      }
    }

    if (isOperation) {
      return (
        <div key={item.id} data-timeline-id={item.id} className="flex gap-3">
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
            
            {chatHistorySettings.verbosity !== 'minimal' && (
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
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  const totalAttachments = 
    attachedFiles.length +
    (attachedContext?.projectMetadata ? 1 : 0) +
    (attachedContext?.artifacts?.length || 0) +
    (attachedContext?.chatSessions?.length || 0) +
    (attachedContext?.requirements?.length || 0) +
    (attachedContext?.standards?.length || 0) +
    (attachedContext?.techStacks?.length || 0) +
    (attachedContext?.canvasNodes?.length || 0) +
    (attachedContext?.canvasEdges?.length || 0) +
    (attachedContext?.canvasLayers?.length || 0) +
    (attachedContext?.files?.length || 0) +
    (attachedContext?.databases?.length || 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Hidden settings trigger button for external activation */}
      <button 
        id="agent-settings-trigger" 
        onClick={() => setIsSettingsOpen(true)}
        className="hidden"
        aria-hidden="true"
      />
      
      {/* Timeline */}
      <div className="flex-1 min-h-0 relative">
        <ScrollArea className="h-full touch-pan-y" ref={scrollViewportRef}>
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
                
                {timeline.map((item, index) => renderTimelineItem(item, index, timeline))}
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

        {/* Task Input - Stacked Layout */}
        <div className="flex flex-col gap-2">
          {/* Top row: All buttons */}
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
                className="h-8 w-8"
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
                <Wrench className="h-4 w-4" />
              </Button>
            </div>

            {/* Right button: Send/Stop */}
            <Button
              onClick={isSubmitting ? handleStop : handleSubmit}
              disabled={!isSubmitting && (!taskInput.trim() || !repoId)}
              size="icon"
              variant={isSubmitting ? "destructive" : "default"}
              className="h-8 w-8"
            >
              {isSubmitting ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          {/* Bottom: Full-width textarea */}
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
            className="min-h-[60px] w-full"
          />
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

      {/* Agent Configuration Modal */}
      <AgentConfigurationModal
        open={isAgentConfigOpen}
        onOpenChange={setIsAgentConfigOpen}
        config={agentConfig}
        onConfigChange={setAgentConfig}
      />

      {/* Chat History Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] w-[90vw] h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chat History Settings</DialogTitle>
            <DialogDescription>
              Configure how chat history is included as context when submitting tasks.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Include History Toggle */}
            <div className="flex items-center gap-2">
              <Checkbox 
                id="include-history" 
                checked={chatHistorySettings.includeHistory}
                onCheckedChange={(checked) => 
                  setChatHistorySettings(prev => ({ ...prev, includeHistory: checked as boolean }))
                }
              />
              <Label htmlFor="include-history" className="text-sm font-medium">
                Include recent chat history with task submissions
              </Label>
            </div>

            {/* Duration Type Selection */}
            {chatHistorySettings.includeHistory && (
              <>
                <div className="space-y-3">
                  <Label className="text-sm font-medium">History Duration</Label>
                  <RadioGroup
                    value={chatHistorySettings.durationType}
                    onValueChange={(value: 'time' | 'messages') =>
                      setChatHistorySettings(prev => ({ ...prev, durationType: value }))
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="time" id="time" />
                      <Label htmlFor="time" className="font-normal cursor-pointer">
                        Last N minutes
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="messages" id="messages" />
                      <Label htmlFor="messages" className="font-normal cursor-pointer">
                        Last N messages
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Duration Value Input */}
                <div className="space-y-2">
                  <Label htmlFor="duration-value" className="text-sm font-medium">
                    {chatHistorySettings.durationType === 'time' ? 'Minutes' : 'Message Count'}
                  </Label>
                  <Input
                    id="duration-value"
                    type="number"
                    min="1"
                    max={chatHistorySettings.durationType === 'time' ? 1440 : 1000}
                    value={chatHistorySettings.durationValue}
                    onChange={(e) =>
                      setChatHistorySettings(prev => ({
                        ...prev,
                        durationValue: parseInt(e.target.value) || 1
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {chatHistorySettings.durationType === 'time'
                      ? 'Include messages from the last N minutes (max 1440 = 24 hours)'
                      : 'Include the last N reasoning messages (max 1000)'}
                  </p>
                </div>
              </>
            )}
          </div>
          
          {/* Agent Message Verbosity */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Agent Message Verbosity</Label>
            <RadioGroup
              value={chatHistorySettings.verbosity}
              onValueChange={(value: 'minimal' | 'standard' | 'detailed') =>
                setChatHistorySettings(prev => ({ ...prev, verbosity: value }))
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="minimal" id="verbosity-minimal" />
                <Label htmlFor="verbosity-minimal" className="font-normal cursor-pointer">
                  Minimal - Operations only (hide reasoning)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="standard" id="verbosity-standard" />
                <Label htmlFor="verbosity-standard" className="font-normal cursor-pointer">
                  Standard - Reasoning + Operations
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="detailed" id="verbosity-detailed" />
                <Label htmlFor="verbosity-detailed" className="font-normal cursor-pointer">
                  Detailed - Full JSON response (for debugging)
                </Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              Controls how much detail is shown in agent response messages
            </p>
            
            {/* Show Blackboard Entries Toggle */}
            <div className="flex items-center gap-2 mt-4">
              <Checkbox 
                id="show-blackboard" 
                checked={chatHistorySettings.showBlackboard}
                onCheckedChange={(checked) => 
                  setChatHistorySettings(prev => ({ ...prev, showBlackboard: checked as boolean }))
                }
              />
              <Label htmlFor="show-blackboard" className="text-sm font-normal cursor-pointer">
                Show agent blackboard entries (memory/planning notes)
              </Label>
            </div>
          </div>

          {/* Download Chat History Section */}
          <div className="space-y-3 pt-4 border-t">
            <Label className="text-sm font-medium">Download Chat History</Label>
            <p className="text-sm text-muted-foreground">
              Export the complete chat history including all user messages, agent responses, 
              and file operations in their original format for audit and review purposes.
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
                  Download Complete History (JSON)
                </>
              )}
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              setIsSettingsOpen(false);
              toast.success('Chat history settings updated');
            }}>
              Save Settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
