-- Insert new annotation node types into canvas_node_types
INSERT INTO public.canvas_node_types (system_name, display_label, description, icon, emoji, color_class, order_score, category, is_legacy, is_active)
VALUES 
  ('NOTES', 'Notes', 'Resizable markdown notes for documentation', 'FileText', '📝', 'bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-400', 10, 'annotation', false, true),
  ('ZONE', 'Zone', 'Resizable background zone for grouping nodes', 'Square', '🔲', 'bg-slate-500/10 border-slate-500/50 text-slate-700 dark:text-slate-400', 11, 'annotation', false, true),
  ('LABEL', 'Label', 'Simple resizable text label', 'Type', '🏷️', 'bg-stone-500/10 border-stone-500/50 text-stone-700 dark:text-stone-400', 12, 'annotation', false, true)
ON CONFLICT (system_name) DO UPDATE SET
  display_label = EXCLUDED.display_label,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  emoji = EXCLUDED.emoji,
  color_class = EXCLUDED.color_class,
  order_score = EXCLUDED.order_score,
  category = EXCLUDED.category,
  is_legacy = EXCLUDED.is_legacy,
  is_active = EXCLUDED.is_active,
  updated_at = now();