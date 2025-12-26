import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen,
  FileText,
  FileCode,
  Loader2,
  AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface RepositoryFilesSelectorProps {
  projectId: string;
  shareToken: string | null;
  selectedFiles: Set<string>;
  onSelectionChange: (selectedPaths: Set<string>) => void;
  includeBinary?: boolean; // For future use
}

interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children: FileTreeNode[];
  content?: string;
  isBinary?: boolean;
  charCount?: number;
}

// Binary file extensions to filter out
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg', '.bmp', '.tiff',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.webm', '.ogg', '.wav', '.avi', '.mov', '.flac', '.aac',
  '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.sqlite', '.db', '.sqlite3',
  '.lock', '.lockb'
]);

const isBinaryFile = (path: string): boolean => {
  const ext = path.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  return BINARY_EXTENSIONS.has(ext);
};

const formatSize = (chars: number): string => {
  if (chars >= 1000000) return `${(chars / 1000000).toFixed(1)}M`;
  if (chars >= 1000) return `${(chars / 1000).toFixed(1)}K`;
  return `${chars}`;
};

const getSizeClass = (chars: number): { class: string; warning: boolean } => {
  if (chars >= 200000) return { class: "bg-destructive text-destructive-foreground", warning: true };
  if (chars >= 100000) return { class: "bg-orange-500 text-white", warning: true };
  if (chars >= 50000) return { class: "bg-yellow-500 text-black", warning: false };
  return { class: "", warning: false };
};

export function RepositoryFilesSelector({
  projectId,
  shareToken,
  selectedFiles,
  onSelectionChange,
  includeBinary = false
}: RepositoryFilesSelectorProps) {
  const [loading, setLoading] = useState(true);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [allFilePaths, setAllFilePaths] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadFiles();
  }, [projectId, shareToken]);

  const loadFiles = async () => {
    if (!projectId) return;
    
    setLoading(true);
    try {
      // Get Prime repo
      const { data: repos } = await supabase.rpc("get_project_repos_with_token", {
        p_project_id: projectId,
        p_token: shareToken
      });
      
      const primeRepo = repos?.find((r: any) => r.is_prime) || repos?.[0];
      if (!primeRepo) {
        setFileTree([]);
        setAllFilePaths([]);
        setLoading(false);
        return;
      }

      // Get committed files
      const { data: committedFiles } = await supabase.rpc("get_project_files_with_token", {
        p_project_id: projectId,
        p_token: shareToken
      });

      // Get staged changes
      const { data: stagedChanges } = await supabase.rpc("get_staged_changes_with_token", {
        p_repo_id: primeRepo.id,
        p_token: shareToken
      });

      // Build effective file map (staged takes precedence)
      const fileMap = new Map<string, { path: string; content: string; isBinary: boolean }>();
      
      // Add committed files
      (committedFiles || []).forEach((f: any) => {
        if (f.repo_id === primeRepo.id) {
          fileMap.set(f.path, {
            path: f.path,
            content: f.content || '',
            isBinary: isBinaryFile(f.path)
          });
        }
      });

      // Overlay staged changes
      (stagedChanges || []).forEach((s: any) => {
        if (s.operation_type === 'delete') {
          fileMap.delete(s.file_path);
        } else if (s.operation_type === 'add' || s.operation_type === 'edit') {
          fileMap.set(s.file_path, {
            path: s.file_path,
            content: s.new_content || '',
            isBinary: s.is_binary || isBinaryFile(s.file_path)
          });
        } else if (s.operation_type === 'rename' && s.old_path) {
          fileMap.delete(s.old_path);
          fileMap.set(s.file_path, {
            path: s.file_path,
            content: s.new_content || '',
            isBinary: s.is_binary || isBinaryFile(s.file_path)
          });
        }
      });

      // Filter out binary files unless includeBinary is true
      const filteredFiles = Array.from(fileMap.values()).filter(
        f => includeBinary || !f.isBinary
      );

      // Build tree structure
      const tree = buildFileTree(filteredFiles);
      setFileTree(tree);
      setAllFilePaths(filteredFiles.map(f => f.path));

      // Auto-expand first level
      const firstLevelFolders = tree
        .filter(node => node.type === 'folder')
        .map(node => node.path);
      setExpandedFolders(new Set(firstLevelFolders));
    } catch (error) {
      console.error("Error loading files:", error);
    } finally {
      setLoading(false);
    }
  };

  const buildFileTree = (files: { path: string; content: string; isBinary: boolean }[]): FileTreeNode[] => {
    const root: FileTreeNode[] = [];
    const folderMap = new Map<string, FileTreeNode>();

    // Sort files by path
    const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

    sortedFiles.forEach(file => {
      const parts = file.path.split('/');
      let currentPath = '';
      let currentLevel = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (isLast) {
          // It's a file
          const charCount = file.content?.length || 0;
          currentLevel.push({
            name: part,
            path: file.path,
            type: 'file',
            children: [],
            content: file.content,
            isBinary: file.isBinary,
            charCount
          });
        } else {
          // It's a folder
          let folder = folderMap.get(currentPath);
          if (!folder) {
            folder = {
              name: part,
              path: currentPath,
              type: 'folder',
              children: []
            };
            folderMap.set(currentPath, folder);
            currentLevel.push(folder);
          }
          currentLevel = folder.children;
        }
      }
    });

    // Sort each level: folders first, then files
    const sortLevel = (nodes: FileTreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      nodes.forEach(node => {
        if (node.type === 'folder') sortLevel(node.children);
      });
    };
    sortLevel(root);

    return root;
  };

  const getAllFilesInFolder = (node: FileTreeNode): string[] => {
    if (node.type === 'file') return [node.path];
    return node.children.flatMap(child => getAllFilesInFolder(child));
  };

  const getFolderSelectionState = (node: FileTreeNode): 'checked' | 'unchecked' | 'indeterminate' => {
    const files = getAllFilesInFolder(node);
    if (files.length === 0) return 'unchecked';
    
    const selectedCount = files.filter(f => selectedFiles.has(f)).length;
    if (selectedCount === 0) return 'unchecked';
    if (selectedCount === files.length) return 'checked';
    return 'indeterminate';
  };

  const toggleFolder = (node: FileTreeNode) => {
    const files = getAllFilesInFolder(node);
    const state = getFolderSelectionState(node);
    
    const newSelected = new Set(selectedFiles);
    if (state === 'checked') {
      // Deselect all
      files.forEach(f => newSelected.delete(f));
    } else {
      // Select all
      files.forEach(f => newSelected.add(f));
    }
    onSelectionChange(newSelected);
  };

  const toggleFile = (path: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    onSelectionChange(newSelected);
  };

  const toggleExpanded = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const handleSelectAll = () => {
    onSelectionChange(new Set(allFilePaths));
  };

  const handleSelectNone = () => {
    onSelectionChange(new Set());
  };

  const getFileIcon = (name: string) => {
    const ext = name.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.md', '.py', '.go', '.rs', '.java'];
    if (codeExtensions.includes(ext)) {
      return <FileCode className="h-4 w-4 text-muted-foreground" />;
    }
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  };

  const renderNode = (node: FileTreeNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const paddingLeft = depth * 16 + 4;

    if (node.type === 'folder') {
      const selectionState = getFolderSelectionState(node);
      return (
        <div key={node.path}>
          <div
            className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent/50 rounded-sm cursor-pointer group"
            style={{ paddingLeft }}
          >
            <button
              onClick={() => toggleExpanded(node.path)}
              className="p-0.5 hover:bg-accent rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <Checkbox
              checked={selectionState === 'checked' ? true : selectionState === 'indeterminate' ? 'indeterminate' : false}
              onCheckedChange={() => toggleFolder(node)}
              className="data-[state=indeterminate]:bg-primary/50"
            />
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 text-yellow-500" />
            ) : (
              <Folder className="h-4 w-4 text-yellow-500" />
            )}
            <span className="text-sm font-medium truncate">{node.name}</span>
            <span className="text-xs text-muted-foreground ml-auto opacity-0 group-hover:opacity-100">
              {getAllFilesInFolder(node).length} files
            </span>
          </div>
          {isExpanded && (
            <div>
              {node.children.map(child => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // File node
    const isSelected = selectedFiles.has(node.path);
    const charCount = node.charCount || 0;
    const sizeInfo = getSizeClass(charCount);
    const showSize = charCount >= 50000; // Only show badge for files >= 50K
    
    return (
      <div
        key={node.path}
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 hover:bg-accent/50 rounded-sm cursor-pointer",
          isSelected && "bg-accent/30",
          sizeInfo.warning && "border-l-2 border-orange-500"
        )}
        style={{ paddingLeft: paddingLeft + 24 }}
        onClick={() => toggleFile(node.path)}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => toggleFile(node.path)}
        />
        {getFileIcon(node.name)}
        <span className="text-sm truncate flex-1">{node.name}</span>
        {showSize && (
          <Badge variant="secondary" className={cn("text-xs ml-auto", sizeInfo.class)}>
            {formatSize(charCount)}
          </Badge>
        )}
        {sizeInfo.warning && (
          <AlertTriangle className="h-3 w-3 text-orange-500 flex-shrink-0" />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading files...</span>
      </div>
    );
  }

  if (fileTree.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">No repository files available.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Add a repository and sync files to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button variant="outline" size="sm" onClick={handleSelectNone}>
          Select None
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {selectedFiles.size} of {allFilePaths.length} files selected
        </span>
      </div>

      <ScrollArea className="h-[400px] border rounded-md">
        <div className="p-2">
          {fileTree.map(node => renderNode(node))}
        </div>
      </ScrollArea>
    </div>
  );
}
