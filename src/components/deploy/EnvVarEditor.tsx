import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Eye, EyeOff, AlertCircle, Upload, Download, FileText } from "lucide-react";

interface EnvVar {
  key: string;
  value: string;
}

interface EnvVarEditorProps {
  value: EnvVar[];
  onChange: (vars: EnvVar[]) => void;
  showClearExisting?: boolean;
  clearExisting?: boolean;
  onClearExistingChange?: (clear: boolean) => void;
  disabled?: boolean;
  keysOnlyMode?: boolean;
}

/**
 * Parse .env format text into key-value pairs
 * Handles: comments (#), quoted values, empty lines, inline comments
 */
function parseEnvFormat(text: string): Array<{ key: string; value: string }> {
  return text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    })
    .map(line => {
      // Find first = sign
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) return null;
      
      const key = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1);
      
      // Remove inline comments (but not in quoted values)
      const trimmedValue = value.trim();
      if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
        value = trimmedValue.slice(1, -1);
      } else if (trimmedValue.startsWith("'") && trimmedValue.endsWith("'")) {
        value = trimmedValue.slice(1, -1);
      } else {
        // Remove inline comment
        const commentIndex = value.indexOf(' #');
        if (commentIndex > -1) {
          value = value.substring(0, commentIndex);
        }
        value = value.trim();
      }
      
      return { key, value };
    })
    .filter((item): item is { key: string; value: string } => item !== null && item.key.length > 0);
}

const EnvVarEditor = ({
  value,
  onChange,
  showClearExisting = false,
  clearExisting = false,
  onClearExistingChange,
  disabled = false,
  keysOnlyMode = false,
}: EnvVarEditorProps) => {
  const [mode, setMode] = useState<"key-value" | "json" | "dotenv">("key-value");
  const [jsonValue, setJsonValue] = useState("");
  const [dotenvValue, setDotenvValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [dotenvError, setDotenvError] = useState<string | null>(null);
  const [visibleValues, setVisibleValues] = useState<Set<number>>(new Set());

  // Sync JSON value when switching to JSON mode or when value changes
  useEffect(() => {
    if (mode === "json") {
      const obj: Record<string, string> = {};
      value.forEach(({ key, value: val }) => {
        if (key.trim()) obj[key.trim()] = val;
      });
      setJsonValue(JSON.stringify(obj, null, 2));
      setJsonError(null);
    }
  }, [mode]);

  // Sync dotenv value when switching to dotenv mode
  useEffect(() => {
    if (mode === "dotenv") {
      const lines = value
        .filter(({ key }) => key.trim())
        .map(({ key, value: val }) => {
          // Quote values with spaces or special chars
          const needsQuotes = val.includes(' ') || val.includes('#') || val.includes('=');
          const quotedVal = needsQuotes ? `"${val}"` : val;
          return `${key.trim()}=${quotedVal}`;
        });
      setDotenvValue(lines.join('\n'));
      setDotenvError(null);
    }
  }, [mode]);

  const handleModeChange = (newMode: string) => {
    if (newMode === "json") {
      // Convert key-value to JSON
      const obj: Record<string, string> = {};
      value.forEach(({ key, value: val }) => {
        if (key.trim()) obj[key.trim()] = val;
      });
      setJsonValue(JSON.stringify(obj, null, 2));
      setJsonError(null);
    } else if (newMode === "dotenv") {
      // Convert key-value to .env format
      const lines = value
        .filter(({ key }) => key.trim())
        .map(({ key, value: val }) => {
          const needsQuotes = val.includes(' ') || val.includes('#') || val.includes('=');
          const quotedVal = needsQuotes ? `"${val}"` : val;
          return `${key.trim()}=${quotedVal}`;
        });
      setDotenvValue(lines.join('\n'));
      setDotenvError(null);
    }
    setMode(newMode as "key-value" | "json" | "dotenv");
  };

  const handleJsonChange = (newJson: string) => {
    setJsonValue(newJson);
    
    try {
      const parsed = JSON.parse(newJson);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setJsonError("Must be a JSON object");
        return;
      }
      
      // Validate all values are strings
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val !== "string") {
          setJsonError(`Value for "${key}" must be a string`);
          return;
        }
      }
      
      setJsonError(null);
      const newVars = Object.entries(parsed).map(([key, val]) => ({
        key,
        value: val as string,
      }));
      onChange(newVars);
    } catch (e) {
      setJsonError("Invalid JSON format");
    }
  };

  const handleDotenvChange = (newDotenv: string) => {
    setDotenvValue(newDotenv);
    
    try {
      const parsed = parseEnvFormat(newDotenv);
      setDotenvError(null);
      onChange(parsed);
    } catch (e) {
      setDotenvError("Failed to parse .env format");
    }
  };

  const addEnvVar = () => {
    onChange([...value, { key: "", value: "" }]);
  };

  const removeEnvVar = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
    setVisibleValues(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const updateEnvVar = (index: number, field: "key" | "value", newValue: string) => {
    const updated = [...value];
    updated[index] = { ...updated[index], [field]: newValue };
    onChange(updated);
  };

  const toggleVisibility = (index: number) => {
    setVisibleValues(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const exportToJson = () => {
    const obj: Record<string, string> = {};
    value.forEach(({ key, value: val }) => {
      if (key.trim()) obj[key.trim()] = val;
    });
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "env-vars.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFromJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("Must be a JSON object");
        }
        
        const newVars = Object.entries(parsed).map(([key, val]) => ({
          key,
          value: String(val),
        }));
        onChange(newVars);
      } catch (e) {
        setJsonError("Failed to parse JSON file");
      }
    };
    input.click();
  };

  const importFromEnvFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".env,.env.*,text/plain";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const parsed = parseEnvFormat(text);
        onChange(parsed);
      } catch (e) {
        setDotenvError("Failed to parse .env file");
      }
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={mode} onValueChange={handleModeChange} className="w-auto">
          <TabsList className="h-8">
            <TabsTrigger value="key-value" className="text-xs px-3">Key-Value</TabsTrigger>
            <TabsTrigger value="json" className="text-xs px-3">JSON</TabsTrigger>
            <TabsTrigger value="dotenv" className="text-xs px-3">
              <FileText className="h-3 w-3 mr-1" />
              .env
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={mode === "dotenv" ? importFromEnvFile : importFromJson}
            disabled={disabled}
            className="h-7 text-xs"
          >
            <Upload className="h-3 w-3 mr-1" />
            Import
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={exportToJson}
            disabled={disabled || value.length === 0}
            className="h-7 text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>
      </div>

      {showClearExisting && onClearExistingChange && (
        <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-md">
          <Checkbox
            id="clearExisting"
            checked={clearExisting}
            onCheckedChange={(checked) => onClearExistingChange(!!checked)}
            disabled={disabled}
          />
          <div className="grid gap-1.5 leading-none">
            <Label
              htmlFor="clearExisting"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Clear Existing Variables
            </Label>
            <p className="text-xs text-muted-foreground">
              {clearExisting
                ? "All existing variables will be replaced with only what's below"
                : "New variables will be merged (existing keys will be overwritten)"}
            </p>
          </div>
        </div>
      )}

      {mode === "key-value" ? (
        <div className="space-y-3">
          {value.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No environment variables defined
            </p>
          ) : (
            value.map((envVar, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="KEY_NAME"
                  value={envVar.key}
                  onChange={(e) => updateEnvVar(index, "key", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                  className="font-mono text-sm flex-1"
                  disabled={disabled}
                />
                <div className="relative flex-[2]">
                  <Input
                    placeholder="value"
                    value={envVar.value}
                    onChange={(e) => updateEnvVar(index, "value", e.target.value)}
                    className="font-mono text-sm pr-10"
                    type={visibleValues.has(index) ? "text" : "password"}
                    disabled={disabled}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full w-9"
                    onClick={() => toggleVisibility(index)}
                    disabled={disabled}
                  >
                    {visibleValues.has(index) ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeEnvVar(index)}
                  className="h-9 w-9 text-destructive hover:text-destructive"
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
          
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addEnvVar}
            disabled={disabled}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Variable
          </Button>
        </div>
      ) : mode === "json" ? (
        <div className="space-y-2">
          <Textarea
            value={jsonValue}
            onChange={(e) => handleJsonChange(e.target.value)}
            placeholder='{"KEY": "value", "ANOTHER_KEY": "another_value"}'
            className="font-mono text-sm min-h-[200px]"
            disabled={disabled}
          />
          {jsonError && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {jsonError}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={dotenvValue}
            onChange={(e) => handleDotenvChange(e.target.value)}
            placeholder={`# Paste your .env content here\nDATABASE_URL=postgres://...\nAPI_KEY="your-api-key"\nDEBUG=true`}
            className="font-mono text-sm min-h-[200px]"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Paste KEY=value pairs (one per line). Supports comments (#), quoted values, and inline comments.
          </p>
          {dotenvError && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {dotenvError}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Environment variables are encrypted and stored securely.
        {keysOnlyMode && " Leave value blank to keep existing. Enter new value to update. Remove row to delete."}
      </p>
    </div>
  );
};

export default EnvVarEditor;
