-- Comprehensive delete_project_with_token function
-- Cleans up ALL project-related tables with activity logging

CREATE OR REPLACE FUNCTION public.delete_project_with_token(
  p_project_id UUID,
  p_token UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counts JSONB := '{}'::JSONB;
  v_count INTEGER;
BEGIN
  -- Validate owner access
  PERFORM public.require_role(p_project_id, p_token, 'owner');

  -- Count items for logging (optional, for transparency)
  SELECT COUNT(*) INTO v_count FROM public.agent_sessions WHERE project_id = p_project_id;
  v_counts := v_counts || jsonb_build_object('agent_sessions', v_count);

  -- 1. Delete agent-related tables (nested dependencies first)
  DELETE FROM public.agent_blackboard WHERE session_id IN (SELECT id FROM public.agent_sessions WHERE project_id = p_project_id);
  DELETE FROM public.agent_file_operations WHERE session_id IN (SELECT id FROM public.agent_sessions WHERE project_id = p_project_id);
  DELETE FROM public.agent_messages WHERE session_id IN (SELECT id FROM public.agent_sessions WHERE project_id = p_project_id);
  DELETE FROM public.agent_session_context WHERE session_id IN (SELECT id FROM public.agent_sessions WHERE project_id = p_project_id);
  DELETE FROM public.agent_llm_logs WHERE project_id = p_project_id;
  DELETE FROM public.agent_sessions WHERE project_id = p_project_id;

  -- 2. Delete repository-related tables
  DELETE FROM public.repo_commits WHERE repo_id IN (SELECT id FROM public.project_repos WHERE project_id = p_project_id);
  DELETE FROM public.repo_files WHERE repo_id IN (SELECT id FROM public.project_repos WHERE project_id = p_project_id);
  DELETE FROM public.repo_pats WHERE repo_id IN (SELECT id FROM public.project_repos WHERE project_id = p_project_id);
  DELETE FROM public.repo_staging WHERE repo_id IN (SELECT id FROM public.project_repos WHERE project_id = p_project_id);
  DELETE FROM public.project_repos WHERE project_id = p_project_id;

  -- 3. Delete deployment-related tables (nested dependencies first)
  DELETE FROM public.deployment_issues WHERE deployment_id IN (SELECT id FROM public.project_deployments WHERE project_id = p_project_id);
  DELETE FROM public.deployment_logs WHERE deployment_id IN (SELECT id FROM public.project_deployments WHERE project_id = p_project_id);
  DELETE FROM public.project_deployments WHERE project_id = p_project_id;

  -- 4. Delete database-related tables (nested dependencies first)
  DELETE FROM public.project_migrations WHERE project_id = p_project_id;
  DELETE FROM public.project_database_sql WHERE project_id = p_project_id;
  DELETE FROM public.project_database_connections WHERE project_id = p_project_id;
  DELETE FROM public.project_databases WHERE project_id = p_project_id;

  -- 5. Delete artifact collaboration tables (nested dependencies first)
  DELETE FROM public.artifact_collaboration_blackboard WHERE collaboration_id IN (SELECT id FROM public.artifact_collaborations WHERE project_id = p_project_id);
  DELETE FROM public.artifact_collaboration_history WHERE collaboration_id IN (SELECT id FROM public.artifact_collaborations WHERE project_id = p_project_id);
  DELETE FROM public.artifact_collaboration_messages WHERE collaboration_id IN (SELECT id FROM public.artifact_collaborations WHERE project_id = p_project_id);
  DELETE FROM public.artifact_collaborations WHERE project_id = p_project_id;
  DELETE FROM public.artifacts WHERE project_id = p_project_id;

  -- 6. Delete chat-related tables
  DELETE FROM public.chat_messages WHERE chat_session_id IN (SELECT id FROM public.chat_sessions WHERE project_id = p_project_id);
  DELETE FROM public.chat_sessions WHERE project_id = p_project_id;

  -- 7. Delete canvas-related tables
  DELETE FROM public.canvas_edges WHERE project_id = p_project_id;
  DELETE FROM public.canvas_nodes WHERE project_id = p_project_id;
  DELETE FROM public.canvas_layers WHERE project_id = p_project_id;

  -- 8. Delete requirements-related tables
  DELETE FROM public.requirement_standards WHERE requirement_id IN (SELECT id FROM public.requirements WHERE project_id = p_project_id);
  DELETE FROM public.requirements WHERE project_id = p_project_id;

  -- 9. Delete audit-related tables
  DELETE FROM public.audit_findings WHERE audit_run_id IN (SELECT id FROM public.audit_runs WHERE project_id = p_project_id);
  DELETE FROM public.audit_runs WHERE project_id = p_project_id;

  -- 10. Delete build sessions
  DELETE FROM public.build_sessions WHERE project_id = p_project_id;

  -- 11. Delete project settings/associations
  DELETE FROM public.project_specifications WHERE project_id = p_project_id;
  DELETE FROM public.project_standards WHERE project_id = p_project_id;
  DELETE FROM public.project_tech_stacks WHERE project_id = p_project_id;

  -- 12. Delete testing logs
  DELETE FROM public.project_testing_logs WHERE project_id = p_project_id;

  -- 13. Delete linked projects (shared access)
  DELETE FROM public.profile_linked_projects WHERE project_id = p_project_id;

  -- 14. Delete published project record if exists
  DELETE FROM public.published_projects WHERE project_id = p_project_id;

  -- 15. Delete activity logs (cleaned up last to allow logging during deletion)
  DELETE FROM public.activity_logs WHERE project_id = p_project_id;

  -- 16. Delete project tokens
  DELETE FROM public.project_tokens WHERE project_id = p_project_id;

  -- 17. Finally delete the project itself
  DELETE FROM public.projects WHERE id = p_project_id;
END;
$function$;

-- Create RPC to get resource counts for deletion preview
CREATE OR REPLACE FUNCTION public.get_project_deletion_counts(
  p_project_id UUID,
  p_token UUID DEFAULT NULL
)
RETURNS TABLE(
  github_repos BIGINT,
  cloud_deployments BIGINT,
  cloud_databases BIGINT,
  external_connections BIGINT,
  total_artifacts BIGINT,
  total_requirements BIGINT,
  total_canvas_nodes BIGINT,
  total_chat_sessions BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate owner access
  PERFORM public.require_role(p_project_id, p_token, 'owner');

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.project_repos WHERE project_id = p_project_id) AS github_repos,
    (SELECT COUNT(*) FROM public.project_deployments WHERE project_id = p_project_id AND render_service_id IS NOT NULL) AS cloud_deployments,
    (SELECT COUNT(*) FROM public.project_databases WHERE project_id = p_project_id AND render_postgres_id IS NOT NULL) AS cloud_databases,
    (SELECT COUNT(*) FROM public.project_database_connections WHERE project_id = p_project_id) AS external_connections,
    (SELECT COUNT(*) FROM public.artifacts WHERE project_id = p_project_id) AS total_artifacts,
    (SELECT COUNT(*) FROM public.requirements WHERE project_id = p_project_id) AS total_requirements,
    (SELECT COUNT(*) FROM public.canvas_nodes WHERE project_id = p_project_id) AS total_canvas_nodes,
    (SELECT COUNT(*) FROM public.chat_sessions WHERE project_id = p_project_id) AS total_chat_sessions;
END;
$function$;