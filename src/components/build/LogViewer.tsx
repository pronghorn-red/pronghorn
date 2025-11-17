import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pause, Play, Search, Download } from "lucide-react";

export interface LogEntry {
  id: string;
  timestamp: Date;
  agent: string;
  level: "info" | "warning" | "error" | "success";
  message: string;
}

interface LogViewerProps {
  logs: LogEntry[];
}

const levelColors = {
  info: "text-blue-600 dark:text-blue-400",
  warning: "text-warning",
  error: "text-destructive",
  success: "text-success",
};

export function LogViewer({ logs }: LogViewerProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isPaused]);

  const filteredLogs = logs.filter((log) =>
    log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.agent.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDownload = () => {
    const logText = logs
      .map((log) => `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] [${log.agent}] ${log.message}`)
      .join("\n");
    
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `build-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Build Logs</CardTitle>
            <CardDescription>Real-time stream of agent activity</CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPaused(!isPaused)}
              className="gap-2"
            >
              {isPaused ? (
                <>
                  <Play className="h-3 w-3" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3" />
                  Pause
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="gap-2"
            >
              <Download className="h-3 w-3" />
              Export
            </Button>
          </div>
        </div>
        
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 pb-6">
        <ScrollArea className="h-[500px] pr-4" ref={scrollRef}>
          <div className="space-y-1 font-mono text-xs">
            {filteredLogs.map((log) => (
              <div key={log.id} className="flex gap-2 py-1 hover:bg-muted/50 px-2 rounded">
                <span className="text-muted-foreground whitespace-nowrap">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <Badge variant="secondary" className="text-xs px-1.5 h-5">
                  {log.agent}
                </Badge>
                <span className={levelColors[log.level]}>{log.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
