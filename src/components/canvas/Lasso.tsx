import { useRef, type PointerEvent } from 'react';
import { useReactFlow, useStore, type Node } from 'reactflow';
import { pointsToPath } from '@/lib/lassoUtils';

type NodePoints = [number, number][];
type NodePointObject = Record<string, NodePoints>;

export function Lasso({
  partial,
  setNodes,
}: {
  partial: boolean;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
}) {
  const { getNodes } = useReactFlow();
  const { width, height } = useStore((state) => ({
    width: state.width,
    height: state.height,
  }));

  const canvas = useRef<HTMLCanvasElement>(null);
  const ctx = useRef<CanvasRenderingContext2D | null>(null);

  const nodePoints = useRef<NodePointObject>({});
  const pointRef = useRef<[number, number][]>([]);

  function handlePointerDown(e: PointerEvent) {
    const c = canvas.current;
    if (!c) return;

    c.setPointerCapture(e.pointerId);

    const rect = c.getBoundingClientRect();
    const nextPoints: [number, number][] = [[
      e.clientX - rect.left,
      e.clientY - rect.top,
    ]];
    pointRef.current = nextPoints;

    nodePoints.current = {};
    const nodes = getNodes();

    for (const node of nodes) {
      const el = document.querySelector(
        `[data-id="${node.id}"]`,
      ) as HTMLDivElement | null;
      if (!el) continue;

      const r = el.getBoundingClientRect();

      const localPoints: [number, number][] = [
        [r.left - rect.left, r.top - rect.top],
        [r.right - rect.left, r.top - rect.top],
        [r.right - rect.left, r.bottom - rect.top],
        [r.left - rect.left, r.bottom - rect.top],
      ];

      nodePoints.current[node.id] = localPoints;
    }

    ctx.current = c.getContext('2d');
    if (!ctx.current) return;
    ctx.current.lineWidth = 1;
    ctx.current.fillStyle = 'rgba(0, 89, 220, 0.08)';
    ctx.current.strokeStyle = 'rgba(0, 89, 220, 0.8)';
  }

  function handlePointerMove(e: PointerEvent) {
    if (e.buttons !== 1) return;

    const c = canvas.current;
    if (!c || !ctx.current) return;

    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const points = pointRef.current;
    const nextPoints = [...points, [x, y]] as [number, number][];
    pointRef.current = nextPoints;

    const path = new Path2D(pointsToPath(nextPoints));

    ctx.current.clearRect(0, 0, width, height);
    ctx.current.fill(path);
    ctx.current.stroke(path);

    const nodesToSelect = new Set<string>();

    for (const [nodeId, pts] of Object.entries(nodePoints.current)) {
      if (partial) {
        if (pts.some(([px, py]) => ctx.current!.isPointInPath(path, px, py))) {
          nodesToSelect.add(nodeId);
        }
      } else {
        if (pts.every(([px, py]) => ctx.current!.isPointInPath(path, px, py))) {
          nodesToSelect.add(nodeId);
        }
      }
    }

    setNodes((nodes) =>
      nodes.map((node) => ({
        ...node,
        selected: nodesToSelect.has(node.id),
      })),
    );
  }

  function handlePointerUp(e: PointerEvent) {
    const c = canvas.current;
    if (c) {
      c.releasePointerCapture(e.pointerId);
    }
    pointRef.current = [];
    if (ctx.current) {
      ctx.current.clearRect(0, 0, width, height);
    }
  }

  return (
    <canvas
      ref={canvas}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'all',
        zIndex: 10,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
