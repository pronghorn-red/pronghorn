import { useState, useRef, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useShareToken } from "@/hooks/useShareToken";
import { useRealtimeChatSessions, useRealtimeChatMessages } from "@/hooks/useRealtimeChatSessions";
import { Plus, Send, Trash2, Copy, Download, Sparkles, Paperclip, Archive } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function Chat() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const { sessions, isLoading: sessionsLoading, createSession, deleteSession, updateSession } = useRealtimeChatSessions(
    projectId,
    shareToken,
    isTokenSet
  );

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAttachDialogOpen, setIsAttachDialogOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

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

  // Fetch available context
  const { data: requirements } = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_requirements_with_token', {
        p_project_id: projectId!,
        p_token: shareToken || null
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId && isTokenSet,
  });

  const { data: canvasNodes } = useQuery({
    queryKey: ['canvas-nodes', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_canvas_nodes_with_token', {
        p_project_id: projectId!,
        p_token: shareToken || null
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId && isTokenSet,
  });

  const { data: artifacts } = useQuery({
    queryKey: ['artifacts', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_artifacts_with_token', {
        p_project_id: projectId!,
        p_token: shareToken || null
      });
      if (error) throw error;
      return data || [];
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

  const handleSummarizeChat = async () => {
    if (!selectedSessionId) return;

    try {
      const { data, error } = await supabase.functions.invoke("summarize-chat", {
        body: { chatSessionId: selectedSessionId, shareToken }
      });

      if (error) throw error;
      toast.success("Chat summarized successfully");
    } catch (error) {
      console.error("Error summarizing chat:", error);
      toast.error("Failed to summarize chat");
    }
  };

  const handleSaveMessageAsArtifact = async (messageContent: string) => {
    if (!projectId) return;

    try {
      const { data, error } = await supabase.rpc("insert_artifact_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_content: messageContent,
        p_source_type: "chat_message",
        p_source_id: selectedSessionId,
      });

      if (error) throw error;
      toast.success("Message saved as artifact");
    } catch (error) {
      console.error("Error saving artifact:", error);
      toast.error("Failed to save artifact");
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedSessionId || isStreaming) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");
    
    // Add user message optimistically
    const tempUserMessage = { 
      id: `temp-${Date.now()}`, 
      role: "user" as const, 
      content: userMessage, 
      created_at: new Date().toISOString() 
    };

    // Start streaming AI response
    setIsStreaming(true);
    setStreamingContent("");

    try {
      // Add user message to DB
      await addMessage("user", userMessage);

      const model = project?.selected_model || "gemini-2.5-flash";
      let edgeFunctionName = "chat-stream-gemini";
      
      if (model.startsWith("claude-")) {
        edgeFunctionName = "chat-stream-anthropic";
      } else if (model.startsWith("grok-")) {
        edgeFunctionName = "chat-stream-xai";
      }

      // Build conversation history for context
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Add the new user message to history
      conversationHistory.push({
        role: "user",
        content: userMessage
      });

      const response = await fetch(
        `https://obkzdksfayygnrzdqoam.supabase.co/functions/v1/${edgeFunctionName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8`,
          },
          body: JSON.stringify({
            systemPrompt: "You are a helpful AI assistant for a project management system.",
            messages: conversationHistory,
            userPrompt: userMessage, // Keep for backward compatibility
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
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const lines = buffer.split("\n");
          // Keep the last partial line (if any) in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              // New agent-style format: { type: "delta", text: "..." }
              if (parsed.type === "delta" && typeof parsed.text === "string") {
                fullResponse += parsed.text;
                setStreamingContent(fullResponse);
                continue;
              }

              // Ignore explicit done events in this format
              if (parsed.type === "done") {
                continue;
              }

              // Fallback for OpenAI-style streaming: { choices[0].delta.content }
              const content = parsed.choices?.[0]?.delta?.content || "";
              if (content) {
                fullResponse += content;
                setStreamingContent(fullResponse);
              }
            } catch (e) {
              // Ignore parse errors for malformed / partial lines
              console.error("Error parsing stream line", e);
            }
          }
        }

        // Flush any remaining buffered line
        if (buffer.trim().startsWith("data: ")) {
          const data = buffer.trim().slice(6).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "delta" && typeof parsed.text === "string") {
                fullResponse += parsed.text;
                setStreamingContent(fullResponse);
              } else if (!parsed.type && parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                fullResponse += content;
                setStreamingContent(fullResponse);
              }
            } catch (e) {
              console.error("Error parsing final stream buffer", e);
            }
          }
        }
      }

      // Save the complete AI response
      if (fullResponse) {
        await addMessage("assistant", fullResponse);
        
        // Small delay to allow realtime to update messages array
        // before clearing streaming content
        await new Promise(resolve => setTimeout(resolve, 500));
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

  const handleDownloadChat = () => {
    if (!selectedSessionId || messages.length === 0) {
      toast.error("No messages to download");
      return;
    }

    const session = sessions.find(s => s.id === selectedSessionId);
    const chatContent = messages
      .map(m => `${m.role === "user" ? "User" : "Assistant"} (${format(new Date(m.created_at), "PPp")}):\n${m.content}\n`)
      .join("\n---\n\n");

    const blob = new Blob([chatContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${session?.ai_title || session?.title || "conversation"}-${format(new Date(), "yyyy-MM-dd")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Chat downloaded");
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
                <div className="border-b border-border p-3 flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={handleSummarizeChat}>
                    <Sparkles className="h-3 w-3 mr-2" />
                    Summarize
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadChat}>
                    <Download className="h-3 w-3 mr-2" />
                    Download
                  </Button>
                </div>

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
                            <div className="prose prose-sm dark:prose-invert max-w-none flex-1">
                              {message.role === "user" ? (
                                <div className="whitespace-pre-wrap">{message.content}</div>
                              ) : (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {message.content}
                                </ReactMarkdown>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleCopyMessage(message.content)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleSaveMessageAsArtifact(message.content)}
                              >
                                <Archive className="h-3 w-3" />
                              </Button>
                            </div>
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
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {streamingContent}
                            </ReactMarkdown>
                          </div>
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
