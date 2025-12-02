-- Add is_prime column to project_repos
ALTER TABLE project_repos ADD COLUMN is_prime BOOLEAN DEFAULT false;

-- Set existing first repo (by created_at) as prime for each project
UPDATE project_repos pr
SET is_prime = true
WHERE pr.id IN (
  SELECT DISTINCT ON (project_id) id 
  FROM project_repos 
  ORDER BY project_id, created_at ASC
);

-- Create RPC to set a repo as prime (unsets others in same project)
CREATE OR REPLACE FUNCTION set_repo_prime_with_token(
  p_repo_id UUID,
  p_token UUID
)
RETURNS project_repos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id UUID;
  result project_repos;
BEGIN
  -- Get project_id from repo
  SELECT project_id INTO v_project_id
  FROM project_repos
  WHERE id = p_repo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repository not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate access
  PERFORM validate_project_access(v_project_id, p_token);

  -- Unset all other repos as prime
  UPDATE project_repos
  SET is_prime = false
  WHERE project_id = v_project_id;

  -- Set this repo as prime
  UPDATE project_repos
  SET is_prime = true
  WHERE id = p_repo_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Create RPC to get the prime repo for a project
CREATE OR REPLACE FUNCTION get_prime_repo_with_token(
  p_project_id UUID,
  p_token UUID
)
RETURNS SETOF project_repos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate access
  PERFORM validate_project_access(p_project_id, p_token);

  RETURN QUERY
    SELECT *
    FROM project_repos
    WHERE project_id = p_project_id
      AND is_prime = true
    LIMIT 1;
END;
$$;

-- Update create_project_repo_with_token to accept is_prime parameter
CREATE OR REPLACE FUNCTION create_project_repo_with_token(
  p_project_id UUID,
  p_token UUID,
  p_organization TEXT,
  p_repo TEXT,
  p_branch TEXT DEFAULT 'main',
  p_is_default BOOLEAN DEFAULT false,
  p_is_prime BOOLEAN DEFAULT NULL
)
RETURNS project_repos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_repo project_repos;
  v_is_prime BOOLEAN;
  v_existing_count INTEGER;
BEGIN
  -- Validate access first
  PERFORM validate_project_access(p_project_id, p_token);

  -- Determine if this should be prime (first repo or explicitly set)
  IF p_is_prime IS NOT NULL THEN
    v_is_prime := p_is_prime;
  ELSE
    -- Check if any repos exist for this project
    SELECT COUNT(*) INTO v_existing_count
    FROM project_repos
    WHERE project_id = p_project_id;
    
    -- First repo is automatically prime
    v_is_prime := (v_existing_count = 0);
  END IF;

  -- If setting as prime, unset others
  IF v_is_prime THEN
    UPDATE project_repos
    SET is_prime = false
    WHERE project_id = p_project_id;
  END IF;

  INSERT INTO project_repos (
    project_id,
    organization,
    repo,
    branch,
    is_default,
    is_prime
  )
  VALUES (
    p_project_id,
    p_organization,
    p_repo,
    p_branch,
    p_is_default,
    v_is_prime
  )
  RETURNING * INTO new_repo;

  RETURN new_repo;
END;
$$;