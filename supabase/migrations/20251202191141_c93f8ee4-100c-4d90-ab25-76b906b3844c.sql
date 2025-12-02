-- Create wildcard multi-term search function for coding agent
CREATE OR REPLACE FUNCTION public.agent_wildcard_search_with_token(
  p_project_id uuid,
  p_token uuid,
  p_search_terms text[]  -- Array of search terms, e.g., ['weather', 'api']
)
RETURNS TABLE (
  id uuid,
  path text,
  content_preview text,
  match_count integer,
  matched_terms text[],
  is_staged boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  term text;
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);

  -- Return combined results from repo_files and repo_staging
  RETURN QUERY
  WITH search_results AS (
    -- Search committed files (repo_files)
    SELECT 
      rf.id,
      rf.path,
      rf.content,
      false AS is_staged,
      rf.repo_id
    FROM repo_files rf
    INNER JOIN project_repos pr ON pr.id = rf.repo_id
    WHERE pr.project_id = p_project_id
      -- Exclude files that have staged deletes
      AND NOT EXISTS (
        SELECT 1 FROM repo_staging rs 
        WHERE rs.repo_id = rf.repo_id 
          AND rs.file_path = rf.path 
          AND rs.operation_type = 'delete'
      )
    
    UNION ALL
    
    -- Search staged new files (add operations)
    SELECT 
      rs.id,
      rs.file_path AS path,
      rs.new_content AS content,
      true AS is_staged,
      rs.repo_id
    FROM repo_staging rs
    INNER JOIN project_repos pr ON pr.id = rs.repo_id
    WHERE pr.project_id = p_project_id
      AND rs.operation_type = 'add'
      AND rs.new_content IS NOT NULL
    
    UNION ALL
    
    -- Search staged edits (use new_content)
    SELECT 
      rf.id,
      rf.path,
      rs.new_content AS content,
      true AS is_staged,
      rf.repo_id
    FROM repo_files rf
    INNER JOIN project_repos pr ON pr.id = rf.repo_id
    INNER JOIN repo_staging rs ON rs.repo_id = rf.repo_id AND rs.file_path = rf.path
    WHERE pr.project_id = p_project_id
      AND rs.operation_type IN ('edit', 'rename')
      AND rs.new_content IS NOT NULL
  ),
  term_matches AS (
    SELECT 
      sr.id,
      sr.path,
      sr.content,
      sr.is_staged,
      unnest(p_search_terms) AS search_term
    FROM search_results sr
  ),
  matched_files AS (
    SELECT 
      tm.id,
      tm.path,
      tm.content,
      tm.is_staged,
      tm.search_term,
      -- Check if term matches path or content (case-insensitive)
      (
        lower(tm.path) LIKE '%' || lower(tm.search_term) || '%'
        OR lower(tm.content) LIKE '%' || lower(tm.search_term) || '%'
      ) AS is_match
    FROM term_matches tm
  ),
  aggregated AS (
    SELECT 
      mf.id,
      mf.path,
      mf.content,
      mf.is_staged,
      COUNT(*) FILTER (WHERE mf.is_match) AS match_count,
      array_agg(DISTINCT mf.search_term) FILTER (WHERE mf.is_match) AS matched_terms
    FROM matched_files mf
    GROUP BY mf.id, mf.path, mf.content, mf.is_staged
    HAVING COUNT(*) FILTER (WHERE mf.is_match) > 0
  )
  SELECT 
    a.id,
    a.path,
    -- Create content preview (first 200 chars)
    LEFT(a.content, 200) AS content_preview,
    a.match_count::integer,
    a.matched_terms,
    a.is_staged
  FROM aggregated a
  ORDER BY a.match_count DESC, a.path ASC;
END;
$function$;