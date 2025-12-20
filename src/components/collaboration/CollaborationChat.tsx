import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Loader2, Brain, Lightbulb, CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

export interface CollaborationMessage {
  id: string;
  role: 'user' | 'assistant';
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

interface CollaborationChatProps {
  messages: CollaborationMessage[];
  blackboard: BlackboardEntry[];
  isStreaming: boolean;
  streamingContent: string;
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  showBlackboard?: boolean;
}

export function CollaborationChat({
  messages,
  blackboard,
  isStreaming,
  streamingContent,
  onSendMessage,
  disabled = false,
  showBlackboard = true,
}: CollaborationChatProps) {
  const [input, setInput] = useState('');
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
      <ScrollArea className="flex-1 p-3 min-h-0" ref={scrollRef}>
        <div className="space-y-3 min-w-0">
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
                    className={`w-full text-left px-3 py-2 rounded-md border text-xs ${getBlackboardColor(entry.entry_type)}`}
                  >
                    <div className="flex items-center gap-2">
                      {getBlackboardIcon(entry.entry_type)}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {entry.entry_type}
                      </Badge>
                      <span className="truncate flex-1 opacity-80">
                        {entry.content.slice(0, 80)}...
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 py-2 text-xs text-muted-foreground">
                    {entry.content}
                  </CollapsibleContent>
                </Collapsible>
              );
            }

            const message = item as CollaborationMessage & { _type: 'message' };
            return (
              <div
                key={message.id}
                className={`flex gap-2 min-w-0 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div
                  className={`rounded-lg px-2 py-1.5 text-sm min-w-0 max-w-full overflow-hidden ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div className="text-sm break-words overflow-hidden [&_p]:m-0 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:text-xs [&_code]:text-xs [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words m-0">{message.content}</p>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-secondary flex items-center justify-center">
                    <User className="h-3 w-3 text-secondary-foreground" />
                  </div>
                )}
              </div>
            );
          })}

          {isStreaming && streamingContent && (
            <div className={`px-3 py-2 rounded-md border text-xs ${getBlackboardColor('reasoning')}`}>
              <div className="flex items-center gap-2 mb-1">
                <Brain className="h-3 w-3 animate-pulse" />
                <span className="font-medium">Thinking...</span>
              </div>
              <p className="text-xs opacity-80">{streamingContent}</p>
            </div>
          )}

          {isStreaming && !streamingContent && (
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
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isStreaming || disabled}
            className="flex-shrink-0 h-[44px] w-[44px]"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
