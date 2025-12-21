import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Link, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { setDatabaseConnectionString } from "@/lib/databaseConnectionSecrets";

interface ConnectDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  shareToken: string | null;
  onSuccess: () => void;
  // For editing existing connection (without connection_string)
  editConnection?: {
    id: string;
    name: string;
    description: string | null;
    host: string | null;
    port: number;
    database_name: string | null;
    ssl_mode: string | null;
  };
}

// Parse connection string to extract display info (NOT credentials)
function parseConnectionString(connStr: string): {
  host: string;
  port: number;
  database_name: string;
  ssl_mode: string;
} | null {
  try {
    // Handle postgresql:// or postgres:// URLs
    const url = new URL(connStr.replace(/^postgres:/, "postgresql:"));
    return {
      host: url.hostname || "",
      port: parseInt(url.port) || 5432,
      database_name: url.pathname.slice(1) || "",
      ssl_mode: url.searchParams.get("sslmode") || "require",
    };
  } catch {
    return null;
  }
}

export function ConnectDatabaseDialog({
  open,
  onOpenChange,
  projectId,
  shareToken,
  onSuccess,
  editConnection,
}: ConnectDatabaseDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [connectionString, setConnectionString] = useState("");
  const [sslMode, setSslMode] = useState("require");
  const [showConnectionString, setShowConnectionString] = useState(false);
  const [parsedInfo, setParsedInfo] = useState<{
    host: string;
    port: number;
    database_name: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "failed" | null>(null);

  const isEditing = !!editConnection;

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (editConnection) {
        setName(editConnection.name);
        setDescription(editConnection.description || "");
        setConnectionString(""); // Never pre-fill connection string
        setSslMode(editConnection.ssl_mode || "require");
        setParsedInfo(
          editConnection.host
            ? {
                host: editConnection.host,
                port: editConnection.port,
                database_name: editConnection.database_name || "",
              }
            : null
        );
      } else {
        setName("");
        setDescription("");
        setConnectionString("");
        setSslMode("require");
        setParsedInfo(null);
      }
      setTestResult(null);
      setShowConnectionString(false);
    }
  }, [open, editConnection]);

  // Parse connection string as user types
  useEffect(() => {
    if (connectionString) {
      const parsed = parseConnectionString(connectionString);
      setParsedInfo(parsed);
      if (parsed?.ssl_mode) {
        setSslMode(parsed.ssl_mode);
      }
    }
  }, [connectionString]);

  const handleTestConnection = async () => {
    if (!connectionString) {
      toast.error("Please enter a connection string");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("manage-database", {
        body: {
          action: "test_connection",
          connectionString,
          shareToken,
        },
      });

      if (error || !data?.success) {
        setTestResult("failed");
        toast.error(data?.error || "Connection failed");
      } else {
        setTestResult("success");
        toast.success("Connection successful!");
      }
    } catch (error: any) {
      setTestResult("failed");
      toast.error(error.message || "Connection test failed");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a name for the connection");
      return;
    }

    if (!isEditing && !connectionString) {
      toast.error("Please enter a connection string");
      return;
    }

    setIsLoading(true);

    try {
      if (isEditing) {
        // Update existing connection metadata first
        const { error } = await supabase.rpc("update_db_connection_with_token", {
          p_connection_id: editConnection.id,
          p_token: shareToken,
          p_name: name.trim(),
          p_description: description.trim() || null,
          p_ssl_mode: sslMode,
          p_host: connectionString && parsedInfo ? parsedInfo.host : undefined,
          p_port: connectionString && parsedInfo ? parsedInfo.port : undefined,
          p_database_name: connectionString && parsedInfo ? parsedInfo.database_name : undefined,
        });
        if (error) throw error;

        // If user provided a new connection string, encrypt and store it separately
        if (connectionString) {
          await setDatabaseConnectionString(editConnection.id, shareToken, connectionString);
        }

        toast.success("Connection updated successfully");
      } else {
        // Create new connection with placeholder connection_string
        // The actual connection string will be encrypted and stored via edge function
        const { data: newConnection, error } = await supabase.rpc("insert_db_connection_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
          p_name: name.trim(),
          p_connection_string: "__PENDING_ENCRYPTION__", // Placeholder - will be replaced by encrypted value
          p_description: description.trim() || null,
          p_host: parsedInfo?.host || null,
          p_port: parsedInfo?.port || 5432,
          p_database_name: parsedInfo?.database_name || null,
          p_ssl_mode: sslMode,
        });

        if (error) throw error;

        // Now encrypt and store the actual connection string
        // The RPC returns the connection ID as a string
        const connectionId = newConnection as unknown as string;
        if (!connectionId) {
          throw new Error("Failed to get connection ID from insert");
        }

        await setDatabaseConnectionString(connectionId, shareToken, connectionString);
        toast.success("Database connection added successfully");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to save connection";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5 text-primary" />
            {isEditing ? "Edit Database Connection" : "Connect to External Database"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the connection details. Leave connection string empty to keep the existing one."
              : "Enter your PostgreSQL connection string to connect to an existing database."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Connection Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Production Database"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="connectionString">
              Connection String {!isEditing && "*"}
              {isEditing && (
                <span className="text-xs text-muted-foreground ml-2">
                  (leave empty to keep existing)
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="connectionString"
                type={showConnectionString ? "text" : "password"}
                placeholder="postgresql://user:password@host:5432/database"
                value={connectionString}
                onChange={(e) => {
                  setConnectionString(e.target.value);
                  setTestResult(null);
                }}
                className="pr-10 font-mono text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowConnectionString(!showConnectionString)}
              >
                {showConnectionString ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            {parsedInfo && (
              <div className="text-xs text-muted-foreground mt-1 p-2 bg-muted rounded">
                <span className="font-medium">Detected:</span> {parsedInfo.host}:
                {parsedInfo.port}/{parsedInfo.database_name}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sslMode">SSL Mode</Label>
            <Select value={sslMode} onValueChange={setSslMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disable">Disable</SelectItem>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="prefer">Prefer</SelectItem>
                <SelectItem value="require">Require</SelectItem>
                <SelectItem value="verify-ca">Verify CA</SelectItem>
                <SelectItem value="verify-full">Verify Full</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Test Connection Button */}
          {connectionString && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="flex-1"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>
              {testResult === "success" && (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
              {testResult === "failed" && (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : isEditing ? (
              "Save Changes"
            ) : (
              "Add Connection"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
