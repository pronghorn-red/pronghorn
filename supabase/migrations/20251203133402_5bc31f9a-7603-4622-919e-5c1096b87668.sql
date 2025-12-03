-- Replace delete_project_with_token to include agent and repo table cleanup
CREATE OR REPLACE FUNCTION public.delete_project_with_token(p_project_id uuid, p_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- ONLY allow authenticated project owners, not token-based access
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to delete project' USING ERRCODE = 'P0001';
  END IF;

  -- Verify user is the project owner
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id
      AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only project owner can delete project' USING ERRCODE = 'P0001';
  END IF;

  -- ============================================
  -- AGENT TABLES (delete via session_id subquery)
  -- ============================================
  
  -- Delete agent blackboard entries (via agent_sessions)
  DELETE FROM public.agent_blackboard
  WHERE session_id IN (
    SELECT id FROM public.agent_sessions WHERE project_id = p_project_id
  );

  -- Delete agent file operations (via agent_sessions)
  DELETE FROM public.agent_file_operations
  WHERE session_id IN (
    SELECT id FROM public.agent_sessions WHERE project_id = p_project_id
  );

  -- Delete agent messages (via agent_sessions)
  DELETE FROM public.agent_messages
  WHERE session_id IN (
    SELECT id FROM public.agent_sessions WHERE project_id = p_project_id
  );

  -- Delete agent session context (via agent_sessions)
  DELETE FROM public.agent_session_context
  WHERE session_id IN (
    SELECT id FROM public.agent_sessions WHERE project_id = p_project_id
  );

  -- Delete agent sessions
  DELETE FROM public.agent_sessions WHERE project_id = p_project_id;

  -- ============================================
  -- REPO TABLES (delete via repo_id subquery)
  -- ============================================
  
  -- Delete repo commits (via project_repos)
  DELETE FROM public.repo_commits
  WHERE repo_id IN (
    SELECT id FROM public.project_repos WHERE project_id = p_project_id
  );

  -- Delete repo files (via project_repos)
  DELETE FROM public.repo_files
  WHERE repo_id IN (
    SELECT id FROM public.project_repos WHERE project_id = p_project_id
  );

  -- Delete repo PATs (via project_repos)
  DELETE FROM public.repo_pats
  WHERE repo_id IN (
    SELECT id FROM public.project_repos WHERE project_id = p_project_id
  );

  -- Delete repo staging (via project_repos)
  DELETE FROM public.repo_staging
  WHERE repo_id IN (
    SELECT id FROM public.project_repos WHERE project_id = p_project_id
  );

  -- Delete project repos
  DELETE FROM public.project_repos WHERE project_id = p_project_id;

  -- ============================================
  -- EXISTING DELETIONS (chat, artifacts, canvas, etc.)
  -- ============================================
  
  -- Delete chat messages (via chat_sessions)
  DELETE FROM public.chat_messages
  WHERE chat_session_id IN (
    SELECT id FROM public.chat_sessions WHERE project_id = p_project_id
  );

  -- Delete chat sessions
  DELETE FROM public.chat_sessions WHERE project_id = p_project_id;

  -- Delete artifacts
  DELETE FROM public.artifacts WHERE project_id = p_project_id;

  -- Delete canvas edges
  DELETE FROM public.canvas_edges WHERE project_id = p_project_id;

  -- Delete canvas nodes
  DELETE FROM public.canvas_nodes WHERE project_id = p_project_id;

  -- Delete canvas layers
  DELETE FROM public.canvas_layers WHERE project_id = p_project_id;

  -- Delete project specifications
  DELETE FROM public.project_specifications WHERE project_id = p_project_id;

  -- Delete project standards
  DELETE FROM public.project_standards WHERE project_id = p_project_id;

  -- Delete project tech stacks
  DELETE FROM public.project_tech_stacks WHERE project_id = p_project_id;

  -- Delete requirement standards (via requirements)
  DELETE FROM public.requirement_standards
  WHERE requirement_id IN (
    SELECT id FROM public.requirements WHERE project_id = p_project_id
  );

  -- Delete requirements
  DELETE FROM public.requirements WHERE project_id = p_project_id;

  -- Delete audit findings (via audit_runs)
  DELETE FROM public.audit_findings
  WHERE audit_run_id IN (
    SELECT id FROM public.audit_runs WHERE project_id = p_project_id
  );

  -- Delete audit runs
  DELETE FROM public.audit_runs WHERE project_id = p_project_id;

  -- Delete build sessions
  DELETE FROM public.build_sessions WHERE project_id = p_project_id;

  -- Delete activity logs
  DELETE FROM public.activity_logs WHERE project_id = p_project_id;

  -- Finally, delete the project itself
  DELETE FROM public.projects WHERE id = p_project_id;
END;
$function$;