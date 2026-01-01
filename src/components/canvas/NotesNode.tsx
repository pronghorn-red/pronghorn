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

  const updateNodeData = useCallback((newContent: string) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, content: newContent } }
          : node
      )
    );
  }, [id, setNodes]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    updateNodeData(content);
  }, [content, updateNodeData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Allow Escape to exit editing
    if (e.key === 'Escape') {
      setIsEditing(false);
      updateNodeData(content);
    }
  }, [content, updateNodeData]);

  // Handle image paste
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        
        toast.info('Uploading image...');
        
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
            
            // The edge function returns 'url' not 'imageUrl'
            const imageUrl = uploadData?.url || uploadData?.imageUrl;
            
            if (imageUrl) {
              // Insert markdown image into content
              const imageMarkdown = `![Pasted Image](${imageUrl})`;
              const newContent = content + (content ? '\n\n' : '') + imageMarkdown;
              setContent(newContent);
              
              // Immediately update node data so it persists
              updateNodeData(newContent);
              
              toast.success('Image uploaded and embedded');
            } else {
              throw new Error('No URL returned from upload');
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
  }, [projectId, token, content, updateNodeData]);

  // Custom components for ReactMarkdown to make images full-width
  const markdownComponents = {
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <img 
        src={src} 
        alt={alt || 'Image'} 
        className="w-full h-auto rounded my-2 object-contain"
      />
    ),
  };

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
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs h-full">
              {content ? (
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
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
