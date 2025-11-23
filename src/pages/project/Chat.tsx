import { useState, useRef, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useShareToken } from "@/hooks/useShareToken";
import { useRealtimeChatSessions, useRealtimeChatMessages } from "@/hooks/useRealtimeChatSessions";
import { Plus, Send, Trash2, Copy, Download } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";

export default function Chat() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const { sessions, isLoading: sessionsLoading, createSession, deleteSession } = useRealtimeChatSessions(
    projectId,
    shareToken,
    isTokenSet
  );

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, addMessage } = useRealtimeChatMessages(
    selectedSessionId || undefined,
    shareToken,
    isTokenSet && !!selectedSessionId
  );

  // Fetch project settings for model configuration
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_project_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null
      });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId && isTokenSet,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleNewChat = async () => {
    const newSession = await createSession();
    if (newSession) {
      setSelectedSessionId(newSession.id);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedSessionId || isStreaming) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");
    
    // Add user message
    await addMessage("user", userMessage);

    // Start streaming AI response
    setIsStreaming(true);
    setStreamingContent("");

    try {
      const model = project?.selected_model || "gemini-2.5-flash";
      let edgeFunctionName = "chat-stream-gemini";
      
      if (model.startsWith("claude-")) {
        edgeFunctionName = "chat-stream-anthropic";
      } else if (model.startsWith("grok-")) {
        edgeFunctionName = "chat-stream-xai";
      }

      const response = await fetch(
        `https://obkzdksfayygnrzdqoam.supabase.co/functions/v1/${edgeFunctionName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
          },
          body: JSON.stringify({
            systemPrompt: "You are a helpful AI assistant for a project management system.",
            userPrompt: userMessage,
            model: model,
            maxOutputTokens: project?.max_tokens || 32768,
            thinkingEnabled: project?.thinking_enabled || false,
            thinkingBudget: project?.thinking_budget || -1,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to get AI response");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || "";
                if (content) {
                  fullResponse += content;
                  setStreamingContent(fullResponse);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }

      // Save the complete AI response
      if (fullResponse) {
        await addMessage("assistant", fullResponse);
      }
    } catch (error) {
      console.error("Error streaming response:", error);
      toast.error("Failed to get AI response");
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} />

        <main className="flex-1 w-full flex">
          {/* Sessions Sidebar */}
          <div className="w-64 border-r border-border bg-card p-4 space-y-4">
            <Button onClick={handleNewChat} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              New Chat
            </Button>

            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-2">
                {sessions.map((session) => (
                  <Card
                    key={session.id}
                    className={`p-3 cursor-pointer hover:bg-muted transition-colors ${
                      selectedSessionId === session.id ? "bg-muted" : ""
                    }`}
                    onClick={() => setSelectedSessionId(session.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {session.ai_title || session.title || "New Chat"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(session.updated_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                          if (selectedSessionId === session.id) {
                            setSelectedSessionId(null);
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {selectedSessionId ? (
              <>
                <ScrollArea className="flex-1 p-6">
                  <div className="max-w-4xl mx-auto space-y-6">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-4 ${
                          message.role === "user" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <Card
                          className={`max-w-[80%] p-4 ${
                            message.role === "user" ? "bg-primary text-primary-foreground" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="whitespace-pre-wrap flex-1">{message.content}</div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 flex-shrink-0"
                              onClick={() => handleCopyMessage(message.content)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-xs opacity-70 mt-2">
                            {format(new Date(message.created_at), "h:mm a")}
                          </p>
                        </Card>
                      </div>
                    ))}

                    {streamingContent && (
                      <div className="flex gap-4 justify-start">
                        <Card className="max-w-[80%] p-4">
                          <div className="whitespace-pre-wrap">{streamingContent}</div>
                        </Card>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="border-t border-border p-4">
                  <div className="max-w-4xl mx-auto flex gap-2">
                    <Textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Type your message... (Shift+Enter for new line)"
                      className="resize-none"
                      rows={3}
                      disabled={isStreaming}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || isStreaming}
                      size="lg"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground">Select a chat or create a new one</p>
                  <Button onClick={handleNewChat}>
                    <Plus className="h-4 w-4 mr-2" />
                    Start New Chat
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
