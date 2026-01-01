import { memo, useState, useCallback, useEffect } from 'react';
import { NodeProps, NodeResizer, useReactFlow, Handle, Position } from 'reactflow';
import { Input } from '@/components/ui/input';

interface LabelNodeData {
  label?: string;
  text?: string;
  subtitle?: string;
  description?: string;
  type?: string;
  nodeType?: string;
  style?: { width?: number; height?: number };
}

export const LabelNode = memo(({ data, selected, id }: NodeProps<LabelNodeData>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.text || data.label || 'Label');
  const { setNodes } = useReactFlow();

  // Sync text with data prop
  useEffect(() => {
    setText(data.text || data.label || 'Label');
  }, [data.text, data.label]);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    // Update node data when done editing
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, text, label: text } }
          : node
      )
    );
  }, [id, text, setNodes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      setIsEditing(false);
      // Update node data when exiting
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, text, label: text } }
            : node
        )
      );
    }
  }, [id, text, setNodes]);

  return (
    <>
      <NodeResizer
        minWidth={80}
        minHeight={30}
        isVisible={selected}
        lineClassName="border-primary"
        handleClassName="h-5 w-5 bg-primary border-2 border-background rounded"
      />
      
      {/* Connection Handles */}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-primary" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-primary" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-primary" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary" />
      
      <div 
        className="h-full w-full flex flex-col items-center justify-center px-2"
        onDoubleClick={handleDoubleClick}
      >
        {isEditing ? (
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="h-full w-full text-center bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-base font-medium"
          />
        ) : (
          <>
            <span className="text-base font-medium text-foreground truncate select-none">
              {text}
            </span>
            {data.subtitle && (
              <span className="text-xs text-muted-foreground truncate select-none">
                {data.subtitle}
              </span>
            )}
          </>
        )}
      </div>
    </>
  );
});

LabelNode.displayName = 'LabelNode';
