import { memo, useState, useCallback, useEffect } from 'react';
import { NodeProps, NodeResizer, useReactFlow } from 'reactflow';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NotesNodeData {
  label?: string;
  content?: string;
  type?: string;
  nodeType?: string;
  style?: { width?: number; height?: number };
}

export const NotesNode = memo(({ data, selected, id }: NodeProps<NotesNodeData>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(data.content || '');
  const { setNodes } = useReactFlow();

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

  return (
    <>
      <NodeResizer
        minWidth={150}
        minHeight={100}
        isVisible={selected}
        lineClassName="border-primary"
        handleClassName="h-3 w-3 bg-primary border-2 border-background rounded"
      />
      <div 
        className="h-full w-full rounded-lg border bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 shadow-sm overflow-hidden flex flex-col"
        onDoubleClick={handleDoubleClick}
      >
        <div className="px-2 py-1 bg-amber-100/80 dark:bg-amber-900/50 border-b border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
          <span>📝</span>
          <span>{data.label || 'Notes'}</span>
        </div>
        <ScrollArea className="flex-1 p-2">
          {isEditing ? (
            <Textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="min-h-full resize-none border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-xs font-mono"
              placeholder="Enter markdown content..."
            />
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              ) : (
                <p className="text-muted-foreground italic">Double-click to edit...</p>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </>
  );
});

NotesNode.displayName = 'NotesNode';
