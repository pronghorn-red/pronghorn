import { useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, User, Bot, Loader2 } from 'lucide-react';
import { useInfiniteAgentMessages } from '@/hooks/useInfiniteAgentMessages';
import { Badge } from '@/components/ui/badge';

interface AgentChatViewerProps {
  projectId: string;
  shareToken: string | null;
}

export function AgentChatViewer({ projectId, shareToken }: AgentChatViewerProps) {
  const { messages, loading, hasMore, loadMore } = useInfiniteAgentMessages(projectId, shareToken);
  const scrollRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (loading || !hasMore) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreTriggerRef.current) {
      observerRef.current.observe(loadMoreTriggerRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loading, hasMore, loadMore]);

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

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Agent Conversation History
        </CardTitle>
        <CardDescription>
          Full interaction history with the coding agent
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full pr-4" ref={scrollRef}>
          {messages.length === 0 && loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">Loading conversation...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">No conversation history yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => {
                const isUser = message.role === 'user';
                const isAgent = message.role === 'agent';

                if (isUser) {
                  return (
                    <div key={message.id} className="flex gap-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold">You</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(message.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (isAgent) {
                  const parsed = parseAgentContent(message.content);
                  return (
                    <div key={message.id} className="flex gap-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-secondary" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold">Agent</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(message.created_at).toLocaleTimeString()}
                          </span>
                          {message.metadata?.iteration && (
                            <Badge variant="outline" className="text-xs">
                              Iteration {message.metadata.iteration}
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

                return null;
              })}
              
              {/* Load more trigger */}
              {hasMore && (
                <div ref={loadMoreTriggerRef} className="flex items-center justify-center py-4">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <p className="text-xs text-muted-foreground">Scroll for more...</p>
                  )}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
