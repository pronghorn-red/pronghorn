import { useState, useEffect, useRef } from "react";
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
import { Loader2, Link, CheckCircle, XCircle, Eye, EyeOff, Upload, ExternalLink, ShieldCheck, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { setDatabaseConnectionString } from "@/lib/databaseConnectionSecrets";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
    ca_certificate?: string | null;
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
  // Always include port for compatibility
  const portNum = port || "5432";
  let connStr = `postgresql://${username}:${password}@${host}:${portNum}`;
  
  // Database is optional - only add if provided
  if (database) {
    connStr += `/${database}`;
  }
  
  // Add SSL mode if not disable
  if (sslMode && sslMode !== "disable") {
    const separator = connStr.includes("?") ? "&" : "?";
    connStr += `${separator}sslmode=${sslMode}`;
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

  // SSL Certificate state
  const [certMode, setCertMode] = useState<"none" | "url" | "upload">("none");
  const [caCertificateUrl, setCaCertificateUrl] = useState("");
  const [caCertificateContent, setCaCertificateContent] = useState("");
  const [certFileName, setCertFileName] = useState("");
  const [certSectionOpen, setCertSectionOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editConnection;
  const hasCertConfigured = editConnection?.ca_certificate ? true : false;

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
        // Reset cert fields
        setCertMode("none");
        setCaCertificateUrl("");
        setCaCertificateContent("");
        setCertFileName("");
        setCertSectionOpen(!!editConnection.ca_certificate);
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
        // Reset cert fields
        setCertMode("none");
        setCaCertificateUrl("");
        setCaCertificateContent("");
        setCertFileName("");
        setCertSectionOpen(false);
      }
      setTestResult(null);
      setShowPassword(false);
      setShowConnectionString(false);
    }
  }, [open, editConnection]);

  // Two-way sync: when connection string changes (in string mode), parse and update fields
  useEffect(() => {
    if (inputMode === "string" && connectionString) {
      const parsed = parseConnectionStringFull(connectionString);
      if (parsed) {
        setConnectionParts(parsed);
        // Extract SSL mode from connection string if present
        try {
          const url = new URL(connectionString.replace(/^postgres:/, "postgresql:"));
          const ssl = url.searchParams.get("sslmode");
          if (ssl && ["disable", "prefer", "require"].includes(ssl)) {
            setSslMode(ssl);
          }
        } catch {
          // Ignore parsing errors
        }
      }
    }
  }, [connectionString, inputMode]);

  // Two-way sync: when fields change (in fields mode), update the connection string
  useEffect(() => {
    if (inputMode === "fields") {
      const built = buildConnectionString(connectionParts, sslMode);
      if (built) {
        setConnectionString(built);
      }
    }
  }, [connectionParts, sslMode, inputMode]);

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

  // Get effective certificate for testing/saving
  const getEffectiveCertificate = (): { url?: string; content?: string } => {
    if (certMode === "url" && caCertificateUrl.trim()) {
      return { url: caCertificateUrl.trim() };
    }
    if (certMode === "upload" && caCertificateContent) {
      return { content: caCertificateContent };
    }
    return {};
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pem') && !file.name.endsWith('.crt')) {
      toast.error("Please upload a .pem or .crt certificate file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content.includes('-----BEGIN CERTIFICATE-----')) {
        toast.error("Invalid certificate file format");
        return;
      }
      setCaCertificateContent(content);
      setCertFileName(file.name);
      toast.success(`Loaded certificate: ${file.name}`);
    };
    reader.onerror = () => {
      toast.error("Failed to read certificate file");
    };
    reader.readAsText(file);
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
      const cert = getEffectiveCertificate();
      const { data, error } = await supabase.functions.invoke("manage-database", {
        body: {
          action: "test_connection",
          connectionString: effectiveConnStr,
          shareToken,
          caCertificate: cert.content,
          caCertificateUrl: cert.url,
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
    const cert = getEffectiveCertificate();

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
          await setDatabaseConnectionString(
            editConnection.id, 
            shareToken, 
            effectiveConnStr,
            cert.url,
            cert.content
          );
        } else if (cert.url || cert.content) {
          // Just update the certificate without changing connection string
          await setDatabaseConnectionString(
            editConnection.id, 
            shareToken, 
            "", // Empty string means keep existing
            cert.url,
            cert.content
          );
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

        await setDatabaseConnectionString(
          connectionId, 
          shareToken, 
          effectiveConnStr,
          cert.url,
          cert.content
        );
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
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
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
                <SelectItem value="disable">Disable (no encryption)</SelectItem>
                <SelectItem value="prefer">Prefer (try TLS, fallback to plain)</SelectItem>
                <SelectItem value="require">Require (TLS required)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* SSL Certificate Section */}
          <Collapsible open={certSectionOpen} onOpenChange={setCertSectionOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  SSL Certificate (Optional)
                  {hasCertConfigured && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      Configured
                    </span>
                  )}
                  {(certMode !== "none" && (caCertificateUrl || caCertificateContent)) && (
                    <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded">
                      New
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {certSectionOpen ? "Hide" : "Show"}
                </span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Provide a CA certificate for strict TLS verification. Required for some cloud databases like AWS RDS.{" "}
                <a
                  href="https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html#UsingWithRDS.SSL.CertificatesAllRegions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Find AWS RDS certificates <ExternalLink className="h-3 w-3" />
                </a>
              </p>

              <Tabs value={certMode} onValueChange={(v) => setCertMode(v as "none" | "url" | "upload")}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="none">None</TabsTrigger>
                  <TabsTrigger value="url">From URL</TabsTrigger>
                  <TabsTrigger value="upload">Upload File</TabsTrigger>
                </TabsList>

                <TabsContent value="none" className="mt-3">
                  <p className="text-xs text-muted-foreground">
                    No CA certificate will be used. TLS will still be attempted based on SSL mode, but without strict certificate verification.
                  </p>
                </TabsContent>

                <TabsContent value="url" className="mt-3 space-y-2">
                  <Label htmlFor="certUrl">Certificate Bundle URL</Label>
                  <Input
                    id="certUrl"
                    placeholder="https://truststore.pki.rds.amazonaws.com/us-west-2/us-west-2-bundle.pem"
                    value={caCertificateUrl}
                    onChange={(e) => setCaCertificateUrl(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    For AWS RDS, use your region-specific bundle URL (e.g., <code className="bg-muted px-1 rounded">us-west-2-bundle.pem</code>).
                  </p>
                </TabsContent>

                <TabsContent value="upload" className="mt-3 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pem,.crt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  {caCertificateContent ? (
                    <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm flex-1 truncate">{certFileName}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setCaCertificateContent("");
                          setCertFileName("");
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload .pem or .crt file
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Upload a PEM-encoded CA certificate bundle from your database provider.
                  </p>
                </TabsContent>
              </Tabs>
            </CollapsibleContent>
          </Collapsible>

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
