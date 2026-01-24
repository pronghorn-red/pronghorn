import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Loader2, Brain, Lightbulb, CheckCircle, Paperclip, X, Square, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

export interface CollaborationMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  created_at: string;
  metadata?: any;
}

export interface BlackboardEntry {
  id: string;
  entry_type: string;
  content: string;
  created_at: string;
}

export interface StreamProgress {
  iteration: number;
  charsReceived: number;
  status: 'idle' | 'streaming' | 'processing' | 'complete';
}

interface CollaborationChatProps {
  messages: CollaborationMessage[];
  blackboard: BlackboardEntry[];
  isStreaming: boolean;
  streamingContent: string;
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  showBlackboard?: boolean;
  attachedCount?: number;
  onAttach?: () => void;
  onClearContext?: () => void;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  // New: streaming progress for client-driven iteration
  streamProgress?: StreamProgress;
  onStop?: () => void;
}

export function CollaborationChat({
  messages,
  blackboard,
  isStreaming,
  streamingContent,
  onSendMessage,
  disabled = false,
  showBlackboard = true,
  attachedCount = 0,
  onAttach,
  onClearContext,
  inputValue,
  onInputChange,
  streamProgress,
  onStop,
}: CollaborationChatProps) {
  // Use controlled state if provided, otherwise use local state as fallback
  const [localInput, setLocalInput] = useState('');
  const input = inputValue !== undefined ? inputValue : localInput;
  const setInput = onInputChange || setLocalInput;
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expandedBlackboard, setExpandedBlackboard] = useState<Set<string>>(new Set());

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, blackboard]);

  const handleSubmit = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isStreaming || disabled) return;
    onSendMessage(trimmedInput);
    setInput('');
    // Keep focus on textarea after sending
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    }
  };

  const toggleBlackboard = (id: string) => {
    setExpandedBlackboard(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getBlackboardIcon = (type: string) => {
    switch (type) {
      case 'planning': return <Lightbulb className="h-3 w-3" />;
      case 'decision': return <CheckCircle className="h-3 w-3" />;
      case 'reasoning': return <Brain className="h-3 w-3" />;
      default: return <Brain className="h-3 w-3" />;
    }
  };

  const getBlackboardColor = (type: string) => {
    switch (type) {
      case 'planning': return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-300';
      case 'decision': return 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300';
      case 'reasoning': return 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300';
      default: return 'bg-muted border-border';
    }
  };

  // Interleave messages and blackboard entries by timestamp
  const combinedTimeline = [...messages.map(m => ({ ...m, _type: 'message' as const })), 
    ...(showBlackboard ? blackboard.map(b => ({ ...b, _type: 'blackboard' as const })) : [])
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <ScrollArea className="flex-1 p-3 min-h-0">
        <div className="space-y-3 pr-2" style={{ wordBreak: 'break-word' }}>
          {combinedTimeline.length === 0 && !isStreaming && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Start a conversation to collaborate on this artifact
            </div>
          )}
          
          {combinedTimeline.map((item) => {
            if (item._type === 'blackboard') {
              const entry = item as BlackboardEntry & { _type: 'blackboard' };
              return (
                <Collapsible key={`bb-${entry.id}`} open={expandedBlackboard.has(entry.id)}>
                  <CollapsibleTrigger
                    onClick={() => toggleBlackboard(entry.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-md border text-xs ${getBlackboardColor(entry.entry_type)}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {getBlackboardIcon(entry.entry_type)}
                      <Badge variant="outline" className="text-[10px] px-1 py-0 flex-shrink-0">
                        {entry.entry_type}
                      </Badge>
                      <span className="truncate opacity-80 text-xs flex-1">
                        {entry.content.slice(0, 50)}...
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-2 py-1.5 text-xs text-muted-foreground whitespace-pre-wrap">
                    {entry.content}
                  </CollapsibleContent>
                </Collapsible>
              );
            }

            const message = item as CollaborationMessage & { _type: 'message' };
            const isUser = message.role === 'user';
            const isTool = message.role === 'tool';
            
            // Tool execution messages - yellow styling
            if (isTool) {
              const isSuccess = message.metadata?.success !== false;
              return (
                <div 
                  key={message.id} 
                  className="px-2 py-1.5 rounded-md border bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-300"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <Wrench className="h-3 w-3 flex-shrink-0" />
                    <Badge 
                      variant="outline" 
                      className="text-[10px] px-1 py-0 bg-yellow-500/20 border-yellow-500/40"
                    >
                      {message.metadata?.operation_type || 'tool'}
                    </Badge>
                    <span className="flex-1 truncate">
                      {isSuccess ? '✓' : '✗'} {message.content}
                    </span>
                    <span className="text-[10px] opacity-60 flex-shrink-0">
                      {new Date(message.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              );
            }
            
            return (
              <div key={message.id}>
                <div className="flex items-center gap-1.5 mb-1">
                  {isUser ? (
                    <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <Bot className="h-3 w-3 text-primary flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium">{isUser ? 'You' : 'Agent'}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(message.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div
                  className={`p-2 rounded-lg text-sm ${
                    isUser
                      ? 'bg-primary/5 border border-primary/10'
                      : 'bg-muted/30 border'
                  }`}
                >
                  {isUser ? (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <div className="text-sm prose prose-sm dark:prose-invert max-w-none [&_p]:m-0 [&_p]:whitespace-pre-wrap [&_pre]:overflow-x-auto [&_pre]:text-xs [&_code]:text-xs">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isStreaming && streamProgress && streamProgress.status !== 'idle' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 bg-muted/50 rounded border">
              <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
              <span className="flex-1">
                Iteration {streamProgress.iteration} - {streamProgress.charsReceived.toLocaleString()} chars
                {streamProgress.status === 'processing' && ' (executing operations...)'}
              </span>
              {onStop && (
                <Button variant="ghost" size="sm" onClick={onStop} className="h-6 px-2">
                  <Square className="h-3 w-3 mr-1" />
                  Stop
                </Button>
              )}
            </div>
          )}

          {isStreaming && streamingContent && (
            <div className={`px-3 py-2 rounded-md border text-xs ${getBlackboardColor('reasoning')}`}>
              <div className="flex items-center gap-2 mb-1">
                <Brain className="h-3 w-3 animate-pulse" />
                <span className="font-medium">Thinking...</span>
              </div>
              <p className="text-xs opacity-80">{streamingContent}</p>
            </div>
          )}

          {isStreaming && !streamingContent && !streamProgress && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="rounded-lg px-3 py-2 text-sm bg-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <form onSubmit={handleFormSubmit} className="border-t p-2 flex-shrink-0">
        {/* Attached Context Display */}
        {attachedCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 px-1">
            <Paperclip className="h-4 w-4" />
            <span>{attachedCount} context item(s) attached</span>
            {onClearContext && (
              <button
                type="button"
                onClick={onClearContext}
                className="ml-auto p-1 hover:text-destructive rounded-sm hover:bg-destructive/10 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI..."
            className="min-h-[44px] max-h-[80px] resize-none text-sm"
            disabled={isStreaming || disabled}
          />
          <div className="flex flex-col gap-1 flex-shrink-0">
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isStreaming || disabled}
              className="h-8 w-8"
            >
              {isStreaming ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </Button>
            {onAttach && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={onAttach}
                disabled={isStreaming || disabled}
                className="h-8 w-8"
              >
                <Paperclip className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
