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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

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

interface ConnectionParts {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
}

// Parse connection string to extract all parts (including credentials)
function parseConnectionStringFull(connStr: string): ConnectionParts | null {
  try {
    // Handle postgresql:// or postgres:// URLs
    const url = new URL(connStr.replace(/^postgres:/, "postgresql:"));
    return {
      host: url.hostname || "",
      port: url.port || "5432",
      username: url.username || "",
      // The password might be URL-encoded, decode it for display
      password: url.password ? decodeURIComponent(url.password) : "",
      database: url.pathname.slice(1) || "",
    };
  } catch {
    return null;
  }
}

// Build connection string from parts (password will be URL-encoded by backend)
function buildConnectionString(parts: ConnectionParts, sslMode: string): string {
  const { host, port, username, password, database } = parts;
  if (!host || !username || !password) return "";
  
  // Build URL - password is NOT encoded here, backend will handle it
  let connStr = `postgresql://${username}:${password}@${host}`;
  if (port && port !== "5432") {
    connStr += `:${port}`;
  }
  if (database) {
    connStr += `/${database}`;
  }
  if (sslMode && sslMode !== "disable") {
    connStr += `?sslmode=${sslMode}`;
  }
  return connStr;
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
  const [inputMode, setInputMode] = useState<"string" | "fields">("fields");
  const [connectionString, setConnectionString] = useState("");
  const [connectionParts, setConnectionParts] = useState<ConnectionParts>({
    host: "",
    port: "5432",
    username: "",
    password: "",
    database: "",
  });
  const [sslMode, setSslMode] = useState("require");
  const [showPassword, setShowPassword] = useState(false);
  const [showConnectionString, setShowConnectionString] = useState(false);
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
        setConnectionString("");
        setConnectionParts({
          host: editConnection.host || "",
          port: editConnection.port?.toString() || "5432",
          username: "",
          password: "",
          database: editConnection.database_name || "",
        });
        setSslMode(editConnection.ssl_mode || "require");
        setInputMode("fields");
      } else {
        setName("");
        setDescription("");
        setConnectionString("");
        setConnectionParts({
          host: "",
          port: "5432",
          username: "",
          password: "",
          database: "",
        });
        setSslMode("require");
        setInputMode("fields");
      }
      setTestResult(null);
      setShowPassword(false);
      setShowConnectionString(false);
    }
  }, [open, editConnection]);

  // When connection string changes, try to parse it and update fields
  useEffect(() => {
    if (inputMode === "string" && connectionString) {
      const parsed = parseConnectionStringFull(connectionString);
      if (parsed) {
        setConnectionParts(parsed);
        // Extract SSL mode from connection string if present
        try {
          const url = new URL(connectionString.replace(/^postgres:/, "postgresql:"));
          const ssl = url.searchParams.get("sslmode");
          if (ssl) setSslMode(ssl);
        } catch {
          // Ignore parsing errors
        }
      }
    }
  }, [connectionString, inputMode]);

  // Get the effective connection string (either from input or built from parts)
  const getEffectiveConnectionString = (): string => {
    if (inputMode === "string") {
      return connectionString;
    }
    return buildConnectionString(connectionParts, sslMode);
  };

  // Check if we have enough info to test/save
  const hasValidConnection = (): boolean => {
    if (inputMode === "string") {
      return !!connectionString.trim();
    }
    return !!(connectionParts.host && connectionParts.username && connectionParts.password);
  };

  // Get parsed info for display
  const getParsedInfo = () => {
    if (inputMode === "string" && connectionString) {
      const parsed = parseConnectionStringFull(connectionString);
      if (parsed) {
        return {
          host: parsed.host,
          port: parseInt(parsed.port) || 5432,
          database_name: parsed.database,
        };
      }
      return null;
    }
    if (connectionParts.host) {
      return {
        host: connectionParts.host,
        port: parseInt(connectionParts.port) || 5432,
        database_name: connectionParts.database,
      };
    }
    return null;
  };

  const handleTestConnection = async () => {
    const effectiveConnStr = getEffectiveConnectionString();
    if (!effectiveConnStr) {
      toast.error("Please enter connection details");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("manage-database", {
        body: {
          action: "test_connection",
          connectionString: effectiveConnStr,
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

    const effectiveConnStr = getEffectiveConnectionString();
    if (!isEditing && !effectiveConnStr) {
      toast.error("Please enter connection details");
      return;
    }

    setIsLoading(true);
    const parsedInfo = getParsedInfo();

    try {
      if (isEditing) {
        // Update existing connection metadata first
        const { error } = await supabase.rpc("update_db_connection_with_token", {
          p_connection_id: editConnection.id,
          p_token: shareToken,
          p_name: name.trim(),
          p_description: description.trim() || null,
          p_ssl_mode: sslMode,
          p_host: effectiveConnStr && parsedInfo ? parsedInfo.host : undefined,
          p_port: effectiveConnStr && parsedInfo ? parsedInfo.port : undefined,
          p_database_name: effectiveConnStr && parsedInfo ? parsedInfo.database_name : undefined,
        });
        if (error) throw error;

        // If user provided a new connection string, encrypt and store it separately
        if (effectiveConnStr) {
          await setDatabaseConnectionString(editConnection.id, shareToken, effectiveConnStr);
        }

        toast.success("Connection updated successfully");
      } else {
        // Create new connection with placeholder connection_string
        const { data: newConnection, error } = await supabase.rpc("insert_db_connection_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
          p_name: name.trim(),
          p_connection_string: "__PENDING_ENCRYPTION__",
          p_description: description.trim() || null,
          p_host: parsedInfo?.host || null,
          p_port: parsedInfo?.port || 5432,
          p_database_name: parsedInfo?.database_name || null,
          p_ssl_mode: sslMode,
        });

        if (error) throw error;

        const connectionId = newConnection as unknown as string;
        if (!connectionId) {
          throw new Error("Failed to get connection ID from insert");
        }

        await setDatabaseConnectionString(connectionId, shareToken, effectiveConnStr);
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
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5 text-primary" />
            {isEditing ? "Edit Database Connection" : "Connect to External Database"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the connection details. Leave credentials empty to keep the existing ones."
              : "Enter your PostgreSQL connection details to connect to an existing database."}
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
              className="h-16"
            />
          </div>

          <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "string" | "fields")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="fields">Individual Fields</TabsTrigger>
              <TabsTrigger value="string">Connection String</TabsTrigger>
            </TabsList>

            <TabsContent value="fields" className="space-y-3 mt-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="host">Host *</Label>
                  <Input
                    id="host"
                    placeholder="db.example.com"
                    value={connectionParts.host}
                    onChange={(e) => {
                      setConnectionParts({ ...connectionParts, host: e.target.value });
                      setTestResult(null);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    placeholder="5432"
                    value={connectionParts.port}
                    onChange={(e) => {
                      setConnectionParts({ ...connectionParts, port: e.target.value });
                      setTestResult(null);
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username *</Label>
                  <Input
                    id="username"
                    placeholder="postgres"
                    value={connectionParts.username}
                    onChange={(e) => {
                      setConnectionParts({ ...connectionParts, username: e.target.value });
                      setTestResult(null);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={connectionParts.password}
                      onChange={(e) => {
                        setConnectionParts({ ...connectionParts, password: e.target.value });
                        setTestResult(null);
                      }}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="database">Database Name</Label>
                <Input
                  id="database"
                  placeholder="mydb (optional)"
                  value={connectionParts.database}
                  onChange={(e) => {
                    setConnectionParts({ ...connectionParts, database: e.target.value });
                    setTestResult(null);
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="string" className="space-y-3 mt-3">
              <div className="space-y-1.5">
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
                <p className="text-xs text-muted-foreground">
                  Paste a connection string and it will be parsed into individual fields automatically.
                </p>
              </div>
            </TabsContent>
          </Tabs>

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
            <p className="text-xs text-muted-foreground">
              For AWS RDS/Lightsail, use "Require" or higher.
            </p>
          </div>

          {/* Test Connection Button */}
          {hasValidConnection() && (
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
