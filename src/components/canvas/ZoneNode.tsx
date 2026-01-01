import { memo, useState, useCallback, useEffect } from 'react';
import { NodeProps, NodeResizer, useReactFlow } from 'reactflow';
import { Input } from '@/components/ui/input';

interface ZoneNodeData {
  label?: string;
  title?: string;
  backgroundColor?: string;
  type?: string;
  nodeType?: string;
  style?: { width?: number; height?: number };
}

const zoneColorClasses: Record<string, string> = {
  blue: 'bg-blue-100/60 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700',
  green: 'bg-green-100/60 dark:bg-green-950/40 border-green-300 dark:border-green-700',
  yellow: 'bg-yellow-100/60 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-700',
  red: 'bg-red-100/60 dark:bg-red-950/40 border-red-300 dark:border-red-700',
  purple: 'bg-purple-100/60 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
  gray: 'bg-slate-100/60 dark:bg-slate-950/40 border-slate-300 dark:border-slate-700',
  orange: 'bg-orange-100/60 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700',
  cyan: 'bg-cyan-100/60 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-700',
};

const zoneTitleClasses: Record<string, string> = {
  blue: 'bg-blue-200/80 dark:bg-blue-900/60 text-blue-900 dark:text-blue-100',
  green: 'bg-green-200/80 dark:bg-green-900/60 text-green-900 dark:text-green-100',
  yellow: 'bg-yellow-200/80 dark:bg-yellow-900/60 text-yellow-900 dark:text-yellow-100',
  red: 'bg-red-200/80 dark:bg-red-900/60 text-red-900 dark:text-red-100',
  purple: 'bg-purple-200/80 dark:bg-purple-900/60 text-purple-900 dark:text-purple-100',
  gray: 'bg-slate-200/80 dark:bg-slate-900/60 text-slate-900 dark:text-slate-100',
  orange: 'bg-orange-200/80 dark:bg-orange-900/60 text-orange-900 dark:text-orange-100',
  cyan: 'bg-cyan-200/80 dark:bg-cyan-900/60 text-cyan-900 dark:text-cyan-100',
};

export const ZoneNode = memo(({ data, selected, id }: NodeProps<ZoneNodeData>) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(data.title || data.label || 'Zone');
  const { setNodes } = useReactFlow();

  const backgroundColor = data.backgroundColor || 'gray';
  const colorClass = zoneColorClasses[backgroundColor] || zoneColorClasses.gray;
  const titleClass = zoneTitleClasses[backgroundColor] || zoneTitleClasses.gray;

  // Sync title with data prop
  useEffect(() => {
    setTitle(data.title || data.label || 'Zone');
  }, [data.title, data.label]);

  const handleTitleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingTitle(true);
  }, []);

  const handleTitleBlur = useCallback(() => {
    setIsEditingTitle(false);
    // Update node data when done editing
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, title, label: title } }
          : node
      )
    );
  }, [id, title, setNodes]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      setIsEditingTitle(false);
      // Update node data when exiting
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, title, label: title } }
            : node
        )
      );
    }
  }, [id, title, setNodes]);

  return (
    <>
      <NodeResizer
        minWidth={200}
        minHeight={150}
        isVisible={selected}
        lineClassName="border-primary"
        handleClassName="h-3 w-3 bg-primary border-2 border-background rounded"
      />
      <div 
        className={`h-full w-full rounded-lg border-2 border-dashed ${colorClass} shadow-sm flex flex-col`}
        style={{ zIndex: -1 }}
      >
        <div 
          className={`px-3 py-1.5 rounded-t-md ${titleClass} cursor-move`}
          onDoubleClick={handleTitleDoubleClick}
        >
          {isEditingTitle ? (
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="h-6 px-1 text-sm font-semibold bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm">🔲</span>
              <span className="text-sm font-semibold">{title}</span>
            </div>
          )}
        </div>
        <div className="flex-1" />
      </div>
    </>
  );
});

ZoneNode.displayName = 'ZoneNode';

export { zoneColorClasses, zoneTitleClasses };
