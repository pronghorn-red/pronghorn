import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, Send, Loader2, Sparkles, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BuildBook, BuildBookStandard, BuildBookTechStack } from "@/hooks/useRealtimeBuildBooks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildChatMarkdown, downloadAsMarkdown } from "@/lib/buildBookDownloadUtils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ResourceInfo {
  name: string;
  url: string;
  resource_type: string;
  description: string | null;
  thumbnail_url: string | null;
}

interface StandardInfo {
  name: string;
  code?: string;
  description: string | null;
  long_description: string | null;
  content: string | null;
  category?: string;
  resources: ResourceInfo[];
}

interface TechStackInfo {
  name: string;
  type?: string | null;
  version?: string | null;
  version_constraint?: string | null;
  description: string | null;
  long_description: string | null;
  resources: ResourceInfo[];
}

interface BuildBookChatProps {
  buildBook: BuildBook;
  standards: BuildBookStandard[];
  techStacks: BuildBookTechStack[];
}

const DEFAULT_SYSTEM_PROMPT = `You are a knowledgeable assistant for this Build Book. You have access to information about the standards and technology stacks included in this collection. Help users understand these standards, their requirements, and how the technology stack components work together. Be helpful, accurate, and provide specific references to the standards and tech stack items when relevant.

When answering questions:
- Reference specific standards by their code/name when applicable
- Explain technical concepts in accessible terms
- Provide practical examples when helpful
- If asked about something not covered in the provided context, acknowledge that limitation`;

export function BuildBookChat({ buildBook, standards, techStacks }: BuildBookChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [standardsInfo, setStandardsInfo] = useState<StandardInfo[]>([]);
  const [techStacksInfo, setTechStacksInfo] = useState<TechStackInfo[]>([]);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  // Load full context when sheet opens
  useEffect(() => {
    if (isOpen && !contextLoaded) {
      loadContext();
    }
  }, [isOpen, contextLoaded]);

  // Check if at bottom helper
  const checkIfAtBottom = useCallback(() => {
    const container = scrollViewportRef.current;
    if (!container) return;
    
    const viewport = container.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return;

    const { scrollTop, scrollHeight, clientHeight } = viewport;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const threshold = 100;
    setIsAtBottom(distanceFromBottom < threshold);
  }, []);

  // Track scroll position to show/hide jump button
  useEffect(() => {
    if (!isOpen) return;
    
    // Small delay to ensure ScrollArea is mounted
    const timer = setTimeout(() => {
      const container = scrollViewportRef.current;
      if (!container) return;
      
      const viewport = container.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (!viewport) return;

      viewport.addEventListener("scroll", checkIfAtBottom, { passive: true });
      checkIfAtBottom(); // Check initial position
      
      // Cleanup stored for later
      (scrollViewportRef as any)._cleanup = () => viewport.removeEventListener("scroll", checkIfAtBottom);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      (scrollViewportRef as any)._cleanup?.();
    };
  }, [isOpen, checkIfAtBottom]);

  // Re-check scroll position when content changes (streaming)
  useEffect(() => {
    if (!isOpen) return;
    checkIfAtBottom();
  }, [messages, isStreaming, isOpen, checkIfAtBottom]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadContext = async () => {
    try {
      // Load standards info with resources
      if (standards.length > 0) {
        const standardIds = standards.map(s => s.standard_id);
        const { data: standardsData } = await supabase
          .from("standards")
          .select("id, code, title, description, long_description, content, category:standard_categories(id, name)")
          .in("id", standardIds);

        // Fetch resources for standards
        const { data: standardResourcesData } = await supabase
          .from("standard_resources")
          .select("standard_id, standard_category_id, resource_type, name, url, description, thumbnail_url")
          .or(`standard_id.in.(${standardIds.join(",")}),standard_category_id.in.(${standardsData?.map(s => (s.category as any)?.id).filter(Boolean).join(",") || "00000000-0000-0000-0000-000000000000"})`);

        if (standardsData) {
          setStandardsInfo(standardsData.map(s => {
            const categoryId = (s.category as any)?.id;
            // Get resources for this standard OR its category
            const resources = (standardResourcesData || [])
              .filter(r => r.standard_id === s.id || r.standard_category_id === categoryId)
              .map(r => ({
                name: r.name,
                url: r.url,
                resource_type: r.resource_type,
                description: r.description,
                thumbnail_url: r.thumbnail_url,
              }));

            return {
              name: s.title,
              code: s.code,
              description: s.description,
              long_description: s.long_description,
              content: s.content,
              category: (s.category as any)?.name,
              resources,
            };
          }));
        }
      }

      // Load tech stacks info with resources
      if (techStacks.length > 0) {
        const techStackIds = techStacks.map(t => t.tech_stack_id);
        const { data: techStacksData } = await supabase
          .from("tech_stacks")
          .select("id, name, type, version, version_constraint, description, long_description")
          .in("id", techStackIds);

        // Fetch resources for tech stacks
        const { data: techStackResourcesData } = await supabase
          .from("tech_stack_resources")
          .select("tech_stack_id, resource_type, name, url, description, thumbnail_url")
          .in("tech_stack_id", techStackIds);

        if (techStacksData) {
          setTechStacksInfo(techStacksData.map(t => {
            const resources = (techStackResourcesData || [])
              .filter(r => r.tech_stack_id === t.id)
              .map(r => ({
                name: r.name,
                url: r.url,
                resource_type: r.resource_type,
                description: r.description,
                thumbnail_url: r.thumbnail_url,
              }));

            return {
              name: t.name,
              type: t.type,
              version: t.version,
              version_constraint: t.version_constraint,
              description: t.description,
              long_description: t.long_description,
              resources,
            };
          }));
        }
      }

      setContextLoaded(true);
    } catch (error) {
      console.error("Error loading context:", error);
      setContextLoaded(true); // Continue anyway
    }
  };

  const buildContextString = () => {
    let context = `## Build Book: ${buildBook.name}\n`;
    if (buildBook.short_description) {
      context += `Description: ${buildBook.short_description}\n`;
    }
    if (buildBook.long_description) {
      context += `\nDetailed Description:\n${buildBook.long_description}\n`;
    }

    if (standardsInfo.length > 0) {
      context += `\n## Standards Included:\n`;
      standardsInfo.forEach(s => {
        context += `\n### ${s.code ? `[${s.code}] ` : ""}${s.name}`;
        if (s.category) context += ` (Category: ${s.category})`;
        context += `\n`;
        if (s.description) context += `${s.description}\n`;
        if (s.content) context += `\nRequirements:\n${s.content}\n`;
        if (s.long_description) context += `\nDetailed Description:\n${s.long_description}\n`;
        if (s.resources.length > 0) {
          context += `\nResources:\n`;
          s.resources.forEach(r => {
            context += `- [${r.resource_type.toUpperCase()}] ${r.name}: ${r.url}`;
            if (r.description) context += ` - ${r.description}`;
            context += `\n`;
          });
        }
      });
    }

    if (techStacksInfo.length > 0) {
      context += `\n## Technology Stack:\n`;
      techStacksInfo.forEach(t => {
        context += `\n### ${t.name}`;
        if (t.type) context += ` (${t.type})`;
        if (t.version) context += ` v${t.version}${t.version_constraint ? ` (${t.version_constraint})` : ''}`;
        context += `\n`;
        if (t.description) context += `${t.description}\n`;
        if (t.long_description) context += `\nDetails:\n${t.long_description}\n`;
        if (t.resources.length > 0) {
          context += `\nResources:\n`;
          t.resources.forEach(r => {
            context += `- [${r.resource_type.toUpperCase()}] ${r.name}: ${r.url}`;
            if (r.description) context += ` - ${r.description}`;
            context += `\n`;
          });
        }
      });
    }

    return context;
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isStreaming) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");

    // Add user message
    const userMsgId = `user-${Date.now()}`;
    setMessages(prev => [...prev, { id: userMsgId, role: "user", content: userMessage }]);

    // Create assistant message placeholder
    const assistantMsgId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantMsgId, role: "assistant", content: "" }]);

    setIsStreaming(true);

    try {
      // Build conversation history
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      // Add the new user message
      conversationHistory.push({ role: "user", content: userMessage });

      // Build system prompt with context
      const contextString = buildContextString();
      const customPrompt = buildBook.prompt || DEFAULT_SYSTEM_PROMPT;
      const systemPrompt = `${customPrompt}\n\n--- BUILD BOOK CONTEXT ---\n${contextString}`;

      // Default to Gemini for public access
      const edgeFunctionName = "chat-stream-gemini";

      const response = await fetch(`https://obkzdksfayygnrzdqoam.supabase.co/functions/v1/${edgeFunctionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8`,
        },
        body: JSON.stringify({
          systemPrompt,
          messages: conversationHistory,
          model: "gemini-2.5-flash",
          maxOutputTokens: 8192,
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
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMsgId ? { ...msg, content: fullResponse } : msg
                  )
                );
                continue;
              }

              if (parsed.type === "done") continue;

              const content = parsed.choices?.[0]?.delta?.content || "";
              if (content) {
                fullResponse += content;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMsgId ? { ...msg, content: fullResponse } : msg
                  )
                );
              }
            } catch (e) {
              console.error("Error parsing stream line", e);
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim().startsWith("data: ")) {
          const data = buffer.trim().slice(6).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "delta" && typeof parsed.text === "string") {
                fullResponse += parsed.text;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMsgId ? { ...msg, content: fullResponse } : msg
                  )
                );
              }
            } catch (e) {
              console.error("Error parsing final stream buffer", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMsgId
            ? { ...msg, content: "Sorry, I encountered an error. Please try again." }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Ask AI
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Ask about {buildBook.name}
            </SheetTitle>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      try {
                        const markdown = buildChatMarkdown(buildBook.name, messages);
                        const safeName = buildBook.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        downloadAsMarkdown(markdown, `buildbook_chat_${safeName}`);
                        toast.success("Chat downloaded as Markdown");
                      } catch (error) {
                        console.error("Download error:", error);
                        toast.error("Failed to download chat");
                      }
                    }}
                    className="text-muted-foreground hover:text-foreground gap-1"
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearChat}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                </>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 relative min-h-0 overflow-hidden">
          <ScrollArea className="h-full px-4" ref={scrollViewportRef}>
            <div className="py-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">
                    Ask any question about the standards and technologies in this Build Book.
                  </p>
                  <p className="text-xs mt-2 opacity-70">
                    The AI has access to all {standardsInfo.length} standards and {techStacksInfo.length} tech stack items.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-2 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content || "..."}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Floating scroll-to-bottom button */}
          {!isAtBottom && (
            <Button
              variant="outline"
              size="icon"
              className="absolute bottom-4 right-6 rounded-full h-10 w-10 shadow-lg z-10 bg-background hover:bg-accent"
              onClick={scrollToBottom}
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
          )}
        </div>

        <div className="p-4 border-t shrink-0">
          <div className="flex gap-2">
            <Textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              className="min-h-[44px] max-h-32 resize-none"
              disabled={isStreaming}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isStreaming}
              size="icon"
              className="shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
