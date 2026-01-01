import { memo, useState, useCallback, useEffect } from 'react';
import { NodeProps, NodeResizer, useReactFlow, Handle, Position } from 'reactflow';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useParams } from 'react-router-dom';
import { useShareToken } from '@/hooks/useShareToken';
import { toast } from 'sonner';

interface NotesNodeData {
  label?: string;
  subtitle?: string;
  description?: string;
  content?: string;
  imageUrl?: string;
  artifactId?: string;
  type?: string;
  nodeType?: string;
  style?: { width?: number; height?: number };
}

// Preprocess markdown to preserve multiple newlines
const preprocessMarkdown = (text: string): string => {
  // Convert double newlines to include a non-breaking space line for preservation
  return text.replace(/\n\n/g, '\n\n&nbsp;\n\n');
};

export const NotesNode = memo(({ data, selected, id }: NodeProps<NotesNodeData>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(data.content || '');
  const { setNodes } = useReactFlow();
  const { projectId } = useParams<{ projectId: string }>();
  const { token } = useShareToken(projectId);

  // Sync content with data prop
  useEffect(() => {
    setContent(data.content || '');
  }, [data.content]);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    // Update node data when done editing
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, content } }
          : node
      )
    );
  }, [id, content, setNodes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Allow Escape to exit editing
    if (e.key === 'Escape') {
      setIsEditing(false);
      // Update node data when exiting
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, content } }
            : node
        )
      );
    }
  }, [id, content, setNodes]);

  // Handle image paste
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        
        // Read as base64
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          
          try {
            const { data: uploadData, error } = await supabase.functions.invoke("upload-artifact-image", {
              body: {
                projectId,
                shareToken: token,
                imageData: base64,
                fileName: `notes-paste-${Date.now()}.png`,
                content: `Pasted image from Notes`,
                sourceType: "notes-paste",
              },
            });
            
            if (error) throw error;
            
            if (uploadData?.imageUrl) {
              // Insert markdown image into content
              const imageMarkdown = `\n![Pasted Image](${uploadData.imageUrl})\n`;
              setContent(prev => prev + imageMarkdown);
              
              // Update node with artifact reference
              if (uploadData?.artifactId) {
                setNodes((nds) =>
                  nds.map((node) =>
                    node.id === id
                      ? { ...node, data: { ...node.data, artifactId: uploadData.artifactId } }
                      : node
                  )
                );
              }
              
              toast.success('Image uploaded and embedded');
            }
          } catch (err) {
            console.error('Error uploading image:', err);
            toast.error('Failed to upload image');
          }
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  }, [projectId, token, id, setNodes]);

  return (
    <>
      <NodeResizer
        minWidth={150}
        minHeight={100}
        isVisible={selected}
        lineClassName="border-primary"
        handleClassName="h-4 w-4 bg-primary border-2 border-background rounded"
      />
      
      {/* Connection Handles */}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-primary" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-primary" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-primary" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary" />
      
      <div 
        className="h-full w-full rounded-lg border bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 shadow-sm overflow-hidden flex flex-col"
        onDoubleClick={handleDoubleClick}
      >
        <div className="px-2 py-1 bg-amber-100/80 dark:bg-amber-900/50 border-b border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-800 dark:text-amber-200 flex flex-col shrink-0">
          <div className="flex items-center gap-1.5">
            <span>📝</span>
            <span>{data.label || 'Notes'}</span>
          </div>
          {data.subtitle && (
            <div className="text-[10px] text-amber-600 dark:text-amber-400 opacity-80 pl-5 truncate">
              {data.subtitle}
            </div>
          )}
        </div>
        <div className="flex-1 p-2 overflow-auto min-h-0">
          {/* Show linked artifact image if present and not editing */}
          {data.imageUrl && !isEditing && (
            <img 
              src={data.imageUrl} 
              alt="Artifact" 
              className="max-w-full h-auto rounded mb-2 object-contain"
              style={{ maxHeight: '60%' }}
            />
          )}
          
          {isEditing ? (
            <Textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              className="h-full w-full min-h-0 resize-none border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-xs font-mono p-0"
              placeholder="Enter markdown content... (Paste images with Ctrl+V)"
            />
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs h-full whitespace-pre-wrap">
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {preprocessMarkdown(content)}
                </ReactMarkdown>
              ) : (
                <p className="text-muted-foreground italic">Double-click to edit...</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
});

NotesNode.displayName = 'NotesNode';
