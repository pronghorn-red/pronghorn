import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, Eye, EyeOff, Database } from "lucide-react";
import { toast } from "sonner";

interface ConnectionStringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionInfo: any;
  databaseName: string;
}

export function ConnectionStringDialog({
  open,
  onOpenChange,
  connectionInfo,
  databaseName,
}: ConnectionStringDialogProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (value: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldName);
      toast.success(`${fieldName} copied to clipboard`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (!connectionInfo) return null;

  // Map Render API response fields to our expected names
  // Render returns: internalConnectionString, externalConnectionString, password, psqlCommand
  // And for individual fields: host (for external), port, databaseName, databaseUser
  const host = connectionInfo.externalHost || connectionInfo.host || "";
  const port = connectionInfo.port || 5432;
  const database = connectionInfo.databaseName || connectionInfo.database || "";
  const user = connectionInfo.databaseUser || connectionInfo.user || "";
  const password = connectionInfo.password || "";
  const internalConnectionString = connectionInfo.internalConnectionString || "";
  const externalConnectionString = connectionInfo.externalConnectionString || "";
  
  // Build PSQL command if not provided
  const psqlCommand = connectionInfo.psqlCommand || 
    (host && password ? `PGPASSWORD='${password}' psql -h ${host} -p ${port} -U ${user} ${database}` : "");

  const CopyButton = ({ value, fieldName }: { value: string; fieldName: string }) => (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => handleCopy(value, fieldName)}
      className="h-8 w-8 shrink-0"
      disabled={!value}
    >
      {copiedField === fieldName ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] h-[95vh] sm:h-auto sm:max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 shrink-0" />
            <span className="truncate">Connection: {databaseName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="space-y-4 py-2">
            {/* Password */}
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword(!showPassword)}
                  className="h-8 w-8 shrink-0"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <CopyButton value={password} fieldName="Password" />
              </div>
            </div>

            {/* Internal Connection String */}
            {internalConnectionString && (
              <div className="space-y-2">
                <Label>Internal Connection String</Label>
                <p className="text-xs text-muted-foreground">
                  Use this for Render services in the same region
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={internalConnectionString}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <CopyButton value={internalConnectionString} fieldName="Internal Connection String" />
                </div>
              </div>
            )}

            {/* External Connection String */}
            {externalConnectionString && (
              <div className="space-y-2">
                <Label>External Connection String</Label>
                <p className="text-xs text-muted-foreground">
                  Use this for external connections
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={externalConnectionString}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <CopyButton value={externalConnectionString} fieldName="External Connection String" />
                </div>
              </div>
            )}

            {/* PSQL Command */}
            {psqlCommand && (
              <div className="space-y-2">
                <Label>PSQL Command</Label>
                <p className="text-xs text-muted-foreground">
                  Copy-paste ready command for psql CLI
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={psqlCommand}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <CopyButton value={psqlCommand} fieldName="PSQL Command" />
                </div>
              </div>
            )}

            {/* Individual connection details */}
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Host</Label>
                <div className="flex items-center gap-1">
                  <code className="text-xs bg-muted px-2 py-1.5 rounded flex-1 truncate block">
                    {host || "—"}
                  </code>
                  <CopyButton value={host} fieldName="Host" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Port</Label>
                <div className="flex items-center gap-1">
                  <code className="text-xs bg-muted px-2 py-1.5 rounded flex-1 block">
                    {port}
                  </code>
                  <CopyButton value={String(port)} fieldName="Port" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Database</Label>
                <div className="flex items-center gap-1">
                  <code className="text-xs bg-muted px-2 py-1.5 rounded flex-1 truncate block">
                    {database || "—"}
                  </code>
                  <CopyButton value={database} fieldName="Database" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">User</Label>
                <div className="flex items-center gap-1">
                  <code className="text-xs bg-muted px-2 py-1.5 rounded flex-1 truncate block">
                    {user || "—"}
                  </code>
                  <CopyButton value={user} fieldName="User" />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                <strong>Tip:</strong> Copy the connection string and paste it as{" "}
                <code className="bg-muted px-1 rounded">DATABASE_URL</code> in your deployment's environment variables.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
