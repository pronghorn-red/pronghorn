import { useState, useRef, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useShareToken } from "@/hooks/useShareToken";
import { useRealtimeChatSessions, useRealtimeChatMessages, ChatMessage } from "@/hooks/useRealtimeChatSessions";
import {
  Plus,
  Send,
  Trash2,
  Copy,
  Download,
  Sparkles,
  Paperclip,
  Archive,
  Edit2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Save,
  Wrench,
  Eye,
  RefreshCw,
  Loader2,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProjectSelector, ProjectSelectionResult } from "@/components/project/ProjectSelector";
import { Menu } from "lucide-react";

export default function Chat() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const {
    sessions,
    isLoading: sessionsLoading,
    createSession,
    deleteSession,
    updateSession,
  } = useRealtimeChatSessions(projectId, shareToken, isTokenSet);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingSummary, setStreamingSummary] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [isAttachDialogOpen, setIsAttachDialogOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const isMobile = useIsMobile();
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [attachedContext, setAttachedContext] = useState<ProjectSelectionResult | null>(null);
  const [isProjectSidebarOpen, setIsProjectSidebarOpen] = useState(false);

  const {
    messages,
    addMessage,
    updateStreamingMessage,
    addTemporaryMessage,
    refresh: refreshMessages,
  } = useRealtimeChatMessages(selectedSessionId || undefined, shareToken, isTokenSet && !!selectedSessionId);

  // Fetch project settings for model configuration
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId && isTokenSet,
  });

  // Fetch available context
  const { data: requirements } = useQuery({
    queryKey: ["requirements", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_requirements_with_token", {
        p_project_id: projectId!,
        p_token: shareToken || null,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId && isTokenSet,
  });

  const { data: canvasNodes } = useQuery({
    queryKey: ["canvas-nodes", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_canvas_nodes_with_token", {
        p_project_id: projectId!,
        p_token: shareToken || null,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId && isTokenSet,
  });

  const { data: artifacts } = useQuery({
    queryKey: ["artifacts", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_artifacts_with_token", {
        p_project_id: projectId!,
        p_token: shareToken || null,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId && isTokenSet,
  });

  // Scroll the latest user message to the top of the viewport once after sending
  // We now do this imperatively in handleSendMessage to avoid repeated scrolling during streaming.


  // Detect user scroll and update auto-scroll state
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

      // Update auto-scroll state based on scroll position
      setIsAutoScrollEnabled(isAtBottom);
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [selectedSessionId]);

  const handleNewChat = async () => {
    const newSession = await createSession();
    if (newSession) {
      setSelectedSessionId(newSession.id);
    }
  };

  const handleSummarizeChat = async () => {
    if (!selectedSessionId || isProcessing) return;

    const session = sessions.find((s) => s.id === selectedSessionId);
    
    // Show modal immediately
    setShowSummaryDialog(true);
    
    // If summary already exists, just show it (don't regenerate)
    if (session?.ai_summary) {
      return;
    }

    // Generate new summary
    await generateSummary();
  };

  const handleRegenerateSummary = async () => {
    if (!selectedSessionId || isProcessing) return;
    
    // Clear existing summary and regenerate
    setStreamingSummary("");
    await generateSummary();
  };

  const generateSummary = async () => {
    if (!selectedSessionId || isProcessing) return;

    setIsProcessing(true);
    setStreamingSummary("");
    toast.loading("Generating summary...", { id: "summarize" });

    try {
      const model = project?.selected_model || "gemini-2.5-flash";
      let edgeFunctionName = "chat-stream-gemini";

      if (model.startsWith("claude-")) {
        edgeFunctionName = "chat-stream-anthropic";
      } else if (model.startsWith("grok-")) {
        edgeFunctionName = "chat-stream-xai";
      }

      // Build conversation history and add summary request
      const conversationHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Add a final user message requesting the summary
      conversationHistory.push({
        role: "user",
        content: "Please provide a summary of our entire conversation above. Include a brief title (5-10 words) and a comprehensive summary (2-3 paragraphs) covering the key points discussed. Format your response as:\nTITLE: [Your title here]\nSUMMARY: [Your summary here]",
      });

      const systemPrompt = `You are a helpful assistant that creates clear, concise summaries of conversations.`;

      const response = await fetch(`https://obkzdksfayygnrzdqoam.supabase.co/functions/v1/${edgeFunctionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8`,
        },
        body: JSON.stringify({
          systemPrompt,
          messages: conversationHistory,
          model: model,
          maxOutputTokens: 4096,
        }),
      });

      if (!response.ok) throw new Error("Failed to generate summary");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullSummary = "";

      if (reader) {
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "delta" && typeof parsed.text === "string") {
                fullSummary += parsed.text;
                setStreamingSummary(fullSummary);
                continue;
              }

              if (parsed.type === "done") {
                continue;
              }

              const content = parsed.choices?.[0]?.delta?.content || "";
              if (content) {
                fullSummary += content;
                setStreamingSummary(fullSummary);
              }
            } catch (e) {
              console.error("Error parsing stream line", e);
            }
          }
        }

        if (buffer.trim().startsWith("data: ")) {
          const data = buffer.trim().slice(6).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "delta" && typeof parsed.text === "string") {
                fullSummary += parsed.text;
                setStreamingSummary(fullSummary);
              } else if (!parsed.type && parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                fullSummary += content;
                setStreamingSummary(fullSummary);
              }
            } catch (e) {
              console.error("Error parsing final stream buffer", e);
            }
          }
        }
      }

      // Parse the summary to extract title and summary
      const titleMatch = fullSummary.match(/TITLE:\s*(.+?)(?:\n|$)/i);
      const summaryMatch = fullSummary.match(/SUMMARY:\s*(.+)/is);
      
      const aiTitle = titleMatch ? titleMatch[1].trim() : "Chat Summary";
      const aiSummary = summaryMatch ? summaryMatch[1].trim() : fullSummary;

      // Save to database
      await updateSession(selectedSessionId, undefined, aiTitle, aiSummary);
      
      toast.success("Summary generated successfully", { id: "summarize" });
    } catch (error) {
      console.error("Error summarizing chat:", error);
      toast.error("Failed to generate summary", { id: "summarize" });
      setShowSummaryDialog(false);
    } finally {
      setIsProcessing(false);
      setStreamingSummary("");
    }
  };

  const handleSaveMessageAsArtifact = async (messageContent: string) => {
    if (!projectId || isProcessing) return;

    setIsProcessing(true);
    toast.loading("Saving as artifact...", { id: "save-message" });

    try {
      const { data, error } = await supabase.rpc("insert_artifact_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_content: messageContent,
        p_source_type: "chat_message",
        p_source_id: selectedSessionId,
        p_image_url: null,
      });

      if (error) throw error;
      toast.success("Message saved as artifact", { id: "save-message" });
    } catch (error) {
      console.error("Error saving artifact:", error);
      toast.error("Failed to save artifact", { id: "save-message" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedSessionId || isStreaming) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");
    
    // Ensure we start from a known auto-scroll state
    setIsAutoScrollEnabled(false);

    try {
      // Add user message immediately (optimistic update)
      await addMessage("user", userMessage);

      // After the message is rendered, scroll it to the top once
      setTimeout(() => {
        const scrollArea = scrollViewportRef.current;
        if (!scrollArea || !lastUserMessageRef.current) return;

        const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
        if (!viewport) return;

        const elementTop = lastUserMessageRef.current.offsetTop;
        viewport.scrollTop = elementTop - 16; // 16px padding from top
      }, 0);

      // Add extra space so there's room for the AI response
      setIsStreaming(true);

      // Create temporary assistant message for streaming
      const assistantTempId = addTemporaryMessage("assistant", "");

      const model = project?.selected_model || "gemini-2.5-flash";
      let edgeFunctionName = "chat-stream-gemini";

      if (model.startsWith("claude-")) {
        edgeFunctionName = "chat-stream-anthropic";
      } else if (model.startsWith("grok-")) {
        edgeFunctionName = "chat-stream-xai";
      }

      // Build conversation history for context
      const conversationHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Add the new user message to history
      conversationHistory.push({
        role: "user",
        content: userMessage,
      });

      // Filter out empty arrays from attachedContext
      const filteredContext = attachedContext ? {
        projectMetadata: attachedContext.projectMetadata || null,
        artifacts: attachedContext.artifacts.length > 0 ? attachedContext.artifacts : undefined,
        chatSessions: attachedContext.chatSessions.length > 0 ? attachedContext.chatSessions : undefined,
        requirements: attachedContext.requirements.length > 0 ? attachedContext.requirements : undefined,
        standards: attachedContext.standards.length > 0 ? attachedContext.standards : undefined,
        techStacks: attachedContext.techStacks.length > 0 ? attachedContext.techStacks : undefined,
        canvasNodes: attachedContext.canvasNodes.length > 0 ? attachedContext.canvasNodes : undefined,
        canvasEdges: attachedContext.canvasEdges.length > 0 ? attachedContext.canvasEdges : undefined,
        canvasLayers: attachedContext.canvasLayers.length > 0 ? attachedContext.canvasLayers : undefined,
      } : undefined;

      const response = await fetch(`https://obkzdksfayygnrzdqoam.supabase.co/functions/v1/${edgeFunctionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8`,
        },
        body: JSON.stringify({
          systemPrompt: "",
          messages: conversationHistory,
          userPrompt: userMessage,
          model: model,
          maxOutputTokens: project?.max_tokens || 32768,
          thinkingEnabled: project?.thinking_enabled || false,
          thinkingBudget: project?.thinking_budget || -1,
          attachedContext: filteredContext,
          projectId: projectId,
          shareToken: shareToken,
        }),
      });

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
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "delta" && typeof parsed.text === "string") {
                fullResponse += parsed.text;
                updateStreamingMessage(assistantTempId, fullResponse);
                continue;
              }

              if (parsed.type === "done") {
                continue;
              }

              const content = parsed.choices?.[0]?.delta?.content || "";
              if (content) {
                fullResponse += content;
                updateStreamingMessage(assistantTempId, fullResponse);
              }
            } catch (e) {
              console.error("Error parsing stream line", e);
            }
          }
        }

        if (buffer.trim().startsWith("data: ")) {
          const data = buffer.trim().slice(6).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "delta" && typeof parsed.text === "string") {
                fullResponse += parsed.text;
                updateStreamingMessage(assistantTempId, fullResponse);
              } else if (!parsed.type && parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                fullResponse += content;
                updateStreamingMessage(assistantTempId, fullResponse);
              }
            } catch (e) {
              console.error("Error parsing final stream buffer", e);
            }
          }
        }
      }

      // Save to database and replace temp message with real one
      if (fullResponse) {
        const { data, error } = await supabase.rpc("insert_chat_message_with_token", {
          p_chat_session_id: selectedSessionId,
          p_token: shareToken || null,
          p_role: "assistant",
          p_content: fullResponse,
        });

        if (error) throw error;

        // Replace temp message with real DB message
        if (data) {
          updateStreamingMessage(assistantTempId, data.content, data.id);
        }

        // Broadcast refresh event for real-time sync
        await supabase.channel(`chat-messages-${selectedSessionId}`).send({
          type: 'broadcast',
          event: 'chat_message_refresh',
          payload: {}
        });
      }
    } catch (error) {
      console.error("Error streaming response:", error);
      toast.error("Failed to get AI response");
    } finally {
      setIsStreaming(false);
    }
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard");
  };

  const handleDownloadChat = () => {
    if (!selectedSessionId || messages.length === 0 || isProcessing) {
      toast.error("No messages to download");
      return;
    }

    setIsProcessing(true);
    toast.loading("Preparing download...", { id: "download" });

    const session = sessions.find((s) => s.id === selectedSessionId);

    let chatContent = "";

    // Add summary if available
    if (session?.ai_summary) {
      chatContent += `=== CHAT SUMMARY ===\n\n`;
      chatContent += `Title: ${session.ai_title || session.title || "Untitled"}\n\n`;
      chatContent += `Summary: ${session.ai_summary}\n\n`;
      chatContent += `===================\n\n`;
    }

    // Add messages
    chatContent += messages
      .map(
        (m) =>
          `${m.role === "user" ? "User" : "Assistant"} (${format(new Date(m.created_at), "PPp")}):\n${m.content}\n`,
      )
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

    toast.success("Chat downloaded", { id: "download" });
    setIsProcessing(false);
  };

  const handleSaveFullChatAsArtifact = async () => {
    if (!selectedSessionId || !projectId || messages.length === 0 || isProcessing) {
      toast.error("No messages to save");
      return;
    }

    setIsProcessing(true);
    toast.loading("Saving full chat as artifact...", { id: "save-full" });

    try {
      const session = sessions.find((s) => s.id === selectedSessionId);
      const chatContent = messages
        .map(
          (m) =>
            `**${m.role === "user" ? "User" : "Assistant"}** (${format(new Date(m.created_at), "PPp")}):\n\n${m.content}\n`,
        )
        .join("\n---\n\n");

      const { data, error } = await supabase.rpc("insert_artifact_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_content: chatContent,
        p_source_type: "chat_session",
        p_source_id: selectedSessionId,
        p_image_url: null,
      });

      if (error) throw error;
      toast.success("Full chat saved as artifact", { id: "save-full" });
    } catch (error) {
      console.error("Error saving chat as artifact:", error);
      toast.error("Failed to save chat as artifact", { id: "save-full" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveSummaryAsArtifact = async () => {
    if (!selectedSessionId || !projectId || isProcessing) return;

    const session = sessions.find((s) => s.id === selectedSessionId);
    if (!session?.ai_summary) {
      toast.error("No summary available");
      return;
    }

    setIsProcessing(true);
    toast.loading("Saving summary as artifact...", { id: "save-summary" });

    try {
      const summaryContent = `# ${session.ai_title || session.title || "Chat Summary"}\n\n${session.ai_summary}`;

      const { data, error } = await supabase.rpc("insert_artifact_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_content: summaryContent,
        p_source_type: "chat_summary",
        p_source_id: selectedSessionId,
        p_image_url: null,
      });

      if (error) throw error;
      toast.success("Summary saved as artifact", { id: "save-summary" });
    } catch (error) {
      console.error("Error saving summary as artifact:", error);
      toast.error("Failed to save summary as artifact", { id: "save-summary" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartRename = (sessionId: string, currentTitle: string) => {
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle || "");
  };

  const handleSaveRename = async (sessionId: string) => {
    if (!editingTitle.trim()) {
      setEditingSessionId(null);
      return;
    }

    try {
      await updateSession(sessionId, editingTitle.trim());
      setEditingSessionId(null);
      toast.success("Chat renamed");
    } catch (error) {
      console.error("Error renaming chat:", error);
      toast.error("Failed to rename chat");
    }
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  return (
    <div className="h-screen bg-background flex flex-col">
      <PrimaryNav />

      <div className="flex relative flex-1 overflow-hidden">
        <ProjectSidebar projectId={projectId!} isOpen={isProjectSidebarOpen} onOpenChange={setIsProjectSidebarOpen} />

        <main className="flex-1 w-full flex overflow-hidden">
          {/* Sessions Sidebar */}
          <div
            className={`border-r border-border bg-card transition-all duration-300 flex flex-col ${
              isSidebarCollapsed ? "w-12" : "w-64"
            }`}
          >
            {/* Header with Menu and Collapse Toggle */}
            <div className="flex items-center justify-between p-2 border-b border-border">
              {!isSidebarCollapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsProjectSidebarOpen(true)}
                  aria-label="Open menu"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 ml-auto"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              >
                {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </div>

            {!isSidebarCollapsed && (
              <div className="p-4 space-y-4">
                <Button onClick={handleNewChat} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  New Chat
                </Button>

                <ScrollArea className="flex-1">
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <Card
                        key={session.id}
                        className={`p-3 cursor-pointer hover:bg-muted transition-colors ${
                          selectedSessionId === session.id ? "bg-muted" : ""
                        }`}
                        onClick={() => {
                          setSelectedSessionId(session.id);
                          if (isMobile) setIsSidebarCollapsed(true);
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {editingSessionId === session.id ? (
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleSaveRename(session.id);
                                    } else if (e.key === "Escape") {
                                      handleCancelRename();
                                    }
                                  }}
                                  className="h-6 text-sm"
                                  autoFocus
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleSaveRename(session.id)}
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <p className="text-sm font-medium break-words line-clamp-3">
                                {(session.ai_title || session.title || "New Chat").slice(0, 150)}
                                {(session.ai_title || session.title || "").length > 150 ? "..." : ""}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(session.updated_at), "MMM d, h:mm a")}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartRename(session.id, session.ai_title || session.title || "");
                              }}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const isCurrentSession = selectedSessionId === session.id;
                                if (isCurrentSession) {
                                  // Clear selection first to prevent flash of old messages
                                  setSelectedSessionId(null);
                                }
                                await deleteSession(session.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {selectedSessionId ? (
              <>
                {/* Action Buttons */}
                <div className="border-b border-border p-3 flex gap-2 justify-end flex-shrink-0">
                  {!isMobile ? (
                    <>
                      <Button variant="outline" size="sm" onClick={handleSummarizeChat} disabled={isProcessing}>
                        <Sparkles className="h-3 w-3 mr-2" />
                        {sessions.find((s) => s.id === selectedSessionId)?.ai_summary ? "View Summary" : "Summarize"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSaveFullChatAsArtifact}
                        disabled={isProcessing}
                      >
                        <Archive className="h-3 w-3 mr-2" />
                        Save as Artifact
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDownloadChat} disabled={isProcessing}>
                        <Download className="h-3 w-3 mr-2" />
                        Download
                      </Button>
                    </>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={isProcessing}>
                          <Wrench className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleSummarizeChat}>
                          <Sparkles className="h-4 w-4 mr-2" />
                          {sessions.find((s) => s.id === selectedSessionId)?.ai_summary ? "View Summary" : "Summarize"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleSaveFullChatAsArtifact}>
                          <Archive className="h-4 w-4 mr-2" />
                          Save as Artifact
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownloadChat}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollViewportRef}>
                  <div className="space-y-6">
                    {messages.map((message, index) => {
                      const isLastUserMessage = message.role === "user" && 
                        index === messages.map((m, i) => m.role === "user" ? i : -1).filter(i => i !== -1).pop();
                      
                      return (
                        <div
                          key={message.id}
                          ref={isLastUserMessage ? lastUserMessageRef : undefined}
                          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <Card
                            className={`w-full md:max-w-[85%] p-4 overflow-hidden ${
                              message.role === "user" ? "bg-primary text-primary-foreground" : ""
                            }`}
                          >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-xs opacity-70">{format(new Date(message.created_at), "h:mm a")}</p>
                            <div className="flex gap-1">
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
                          <div className="prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden [&_p]:mb-4 [&_ul]:my-4 [&_ol]:my-4 [&_li]:mb-2 [&_h1]:mb-4 [&_h2]:mb-4 [&_h3]:mb-3 [&_h4]:mb-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:break-all [&_code]:whitespace-pre-wrap">
                            {message.role === "user" ? (
                              <div className="whitespace-pre-wrap break-words overflow-hidden">{message.content}</div>
                            ) : (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                            )}
                          </div>
                        </Card>
                      </div>
                    );
                    })}

                    {streamingContent && (
                      <div className="flex justify-start">
                        <Card className="w-full md:max-w-[85%] p-4 overflow-hidden">
                          <div className="prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden [&_p]:mb-4 [&_ul]:my-4 [&_ol]:my-4 [&_li]:mb-2 [&_h1]:mb-4 [&_h2]:mb-4 [&_h3]:mb-3 [&_h4]:mb-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:break-all [&_code]:whitespace-pre-wrap">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                          </div>
                        </Card>
                      </div>
                    )}

                    {/* Extra space for AI responses when scrolled to user message */}
                    {isStreaming && <div className="min-h-[60vh]" />}
                    
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Scroll to bottom button */}
                {!isAutoScrollEnabled && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute bottom-36 right-6 rounded-full h-10 w-10 shadow-lg z-10 bg-background hover:bg-accent"
                    onClick={() => {
                      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </Button>
                )}

                <div className="border-t border-border p-4 flex-shrink-0 space-y-3">
                  {/* Attached Context Display */}
                  {attachedContext && (
                    <Card className="bg-muted/50">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-xs font-medium mb-2">Attached Context:</p>
                            <div className="text-xs text-muted-foreground space-y-1">
                              {attachedContext.projectMetadata && <p>✓ Project metadata</p>}
                              {attachedContext.artifacts.length > 0 && <p>✓ {attachedContext.artifacts.length} artifacts</p>}
                              {attachedContext.chatSessions.length > 0 && <p>✓ {attachedContext.chatSessions.length} chat sessions</p>}
                              {attachedContext.requirements.length > 0 && <p>✓ {attachedContext.requirements.length} requirements</p>}
                              {attachedContext.standards.length > 0 && <p>✓ {attachedContext.standards.length} standards</p>}
                              {attachedContext.techStacks.length > 0 && <p>✓ {attachedContext.techStacks.length} tech stacks</p>}
                              {attachedContext.canvasNodes.length > 0 && <p>✓ {attachedContext.canvasNodes.length} canvas nodes</p>}
                              {attachedContext.canvasEdges.length > 0 && <p>✓ {attachedContext.canvasEdges.length} canvas edges</p>}
                              {attachedContext.canvasLayers.length > 0 && <p>✓ {attachedContext.canvasLayers.length} canvas layers</p>}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setAttachedContext(null)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  <div className="flex gap-2">
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
                    <div className="flex flex-col gap-2">
                      <Button 
                        variant="outline" 
                        onClick={() => setIsProjectSelectorOpen(true)} 
                        size="icon"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <Button onClick={handleSendMessage} disabled={!inputMessage.trim() || isStreaming} size="icon">
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
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

      {/* Project Selector */}
      <ProjectSelector
        projectId={projectId!}
        shareToken={shareToken}
        open={isProjectSelectorOpen}
        onClose={() => setIsProjectSelectorOpen(false)}
        onConfirm={(selection) => {
          setAttachedContext(selection);
          toast.success("Project elements attached to chat context");
        }}
        initialSelection={attachedContext || undefined}
      />

      {/* Summary Dialog */}
      <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
        <DialogContent className="w-[80vw] h-[80vh] max-w-none flex flex-col">
          <DialogHeader>
            <DialogTitle>{sessions.find((s) => s.id === selectedSessionId)?.ai_title || "Chat Summary"}</DialogTitle>
            <DialogDescription>AI-generated summary of this conversation</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {streamingSummary || 
                 sessions.find((s) => s.id === selectedSessionId)?.ai_summary || 
                 "Click 'Generate Summary' to create an AI summary of this conversation"}
              </ReactMarkdown>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end mt-4 pt-4 border-t flex-shrink-0">
            {sessions.find((s) => s.id === selectedSessionId)?.ai_summary && (
              <>
                <Button variant="outline" onClick={handleSaveSummaryAsArtifact} disabled={isProcessing} className="flex-shrink-0">
                  <Archive className="h-4 w-4 mr-2" />
                  Save as Artifact
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleRegenerateSummary}
                  disabled={isProcessing}
                  className="flex-shrink-0"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
              </>
            )}
            {!sessions.find((s) => s.id === selectedSessionId)?.ai_summary && (
              <Button onClick={generateSummary} disabled={isProcessing} className="flex-shrink-0">
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Summary
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
