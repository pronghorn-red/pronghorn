import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AgentPromptSection {
  id: string;
  title: string;
  description: string;
  type: 'static' | 'dynamic';
  editable: 'editable' | 'readonly' | 'substitutable';
  order: number;
  content: string;
  variables?: string[];
  isCustom?: boolean;
}

export interface AgentDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  agentType: string;
  sections: AgentPromptSection[];
  isDefault?: boolean;
}

interface UseProjectAgentReturn {
  agentDefinition: AgentDefinition | null;
  sections: AgentPromptSection[];
  loading: boolean;
  saving: boolean;
  hasCustomConfig: boolean;
  loadDefaultTemplate: () => Promise<AgentDefinition | null>;
  saveAgentConfig: (definition: AgentDefinition) => Promise<boolean>;
  resetToDefault: () => Promise<boolean>;
  updateSection: (sectionId: string, updates: Partial<AgentPromptSection>) => void;
  addCustomSection: (section: AgentPromptSection) => void;
  removeSection: (sectionId: string) => void;
  exportDefinition: () => string;
  importDefinition: (json: string) => boolean;
}

export function useProjectAgent(
  projectId: string,
  agentType: string = 'coding-agent-orchestrator',
  shareToken: string | null
): UseProjectAgentReturn {
  const [agentDefinition, setAgentDefinition] = useState<AgentDefinition | null>(null);
  const [sections, setSections] = useState<AgentPromptSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasCustomConfig, setHasCustomConfig] = useState(false);
  const [defaultTemplate, setDefaultTemplate] = useState<AgentDefinition | null>(null);

  // Load the default template from JSON file
  const loadDefaultTemplate = useCallback(async (): Promise<AgentDefinition | null> => {
    try {
      const response = await fetch('/data/codingAgentPromptTemplate.json');
      if (!response.ok) throw new Error('Failed to load default template');
      const template = await response.json();
      setDefaultTemplate(template);
      return template;
    } catch (error) {
      console.error('Error loading default template:', error);
      toast.error('Failed to load default agent template');
      return null;
    }
  }, []);

  // Load agent configuration from database or use defaults
  const loadAgentConfig = useCallback(async () => {
    setLoading(true);
    try {
      // First, load the default template
      const template = await loadDefaultTemplate();
      
      // Try to fetch custom config from database
      const { data, error } = await supabase.rpc('get_project_agent_with_token', {
        p_project_id: projectId,
        p_token: shareToken,
        p_agent_type: agentType,
      });

      if (error) {
        console.error('Error fetching agent config:', error);
        // Fall back to default template
        if (template) {
          setAgentDefinition(template);
          setSections(template.sections);
          setHasCustomConfig(false);
        }
        return;
      }

      if (data && data.length > 0) {
        // Custom config exists
        const customConfig = data[0];
        const definition: AgentDefinition = {
          id: customConfig.id,
          name: customConfig.name,
          version: customConfig.version,
          description: customConfig.description || '',
          agentType: customConfig.agent_type,
          sections: customConfig.sections as unknown as AgentPromptSection[],
          isDefault: customConfig.is_default,
        };
        setAgentDefinition(definition);
        setSections(definition.sections);
        setHasCustomConfig(true);
      } else if (template) {
        // No custom config, use default template
        setAgentDefinition(template);
        setSections(template.sections);
        setHasCustomConfig(false);
      }
    } catch (error) {
      console.error('Error in loadAgentConfig:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, agentType, shareToken, loadDefaultTemplate]);

  useEffect(() => {
    if (projectId) {
      loadAgentConfig();
    }
  }, [projectId, loadAgentConfig]);

  // Save agent configuration to database
  const saveAgentConfig = useCallback(async (definition: AgentDefinition): Promise<boolean> => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('upsert_project_agent_with_token', {
        p_project_id: projectId,
        p_token: shareToken,
        p_agent_type: agentType,
        p_name: definition.name,
        p_description: definition.description,
        p_version: definition.version,
        p_sections: definition.sections as any,
      });

      if (error) throw error;

      setAgentDefinition(definition);
      setSections(definition.sections);
      setHasCustomConfig(true);
      toast.success('Agent configuration saved');
      return true;
    } catch (error) {
      console.error('Error saving agent config:', error);
      toast.error('Failed to save agent configuration');
      return false;
    } finally {
      setSaving(false);
    }
  }, [projectId, agentType, shareToken]);

  // Reset to default template
  const resetToDefault = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      // Delete custom config from database
      const { error } = await supabase.rpc('delete_project_agent_with_token', {
        p_project_id: projectId,
        p_token: shareToken,
        p_agent_type: agentType,
      });

      if (error) throw error;

      // Reload default template
      const template = defaultTemplate || await loadDefaultTemplate();
      if (template) {
        setAgentDefinition(template);
        setSections(template.sections);
        setHasCustomConfig(false);
        toast.success('Reset to default configuration');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error resetting to default:', error);
      toast.error('Failed to reset configuration');
      return false;
    } finally {
      setSaving(false);
    }
  }, [projectId, agentType, shareToken, defaultTemplate, loadDefaultTemplate]);

  // Update a single section
  const updateSection = useCallback((sectionId: string, updates: Partial<AgentPromptSection>) => {
    setSections(prev => prev.map(section =>
      section.id === sectionId ? { ...section, ...updates } : section
    ));
  }, []);

  // Add a custom section
  const addCustomSection = useCallback((section: AgentPromptSection) => {
    setSections(prev => [...prev, { ...section, isCustom: true }].sort((a, b) => a.order - b.order));
  }, []);

  // Remove a section (only custom sections can be removed)
  const removeSection = useCallback((sectionId: string) => {
    setSections(prev => prev.filter(section => 
      section.id !== sectionId || !section.isCustom
    ));
  }, []);

  // Export current definition as JSON string
  const exportDefinition = useCallback((): string => {
    const definition: AgentDefinition = {
      id: agentDefinition?.id || 'custom-export',
      name: agentDefinition?.name || 'Custom Agent Definition',
      version: agentDefinition?.version || '1.0.0',
      description: agentDefinition?.description || 'Exported agent definition',
      agentType,
      sections,
    };
    return JSON.stringify(definition, null, 2);
  }, [agentDefinition, sections, agentType]);

  // Import definition from JSON string
  const importDefinition = useCallback((json: string): boolean => {
    try {
      const imported = JSON.parse(json) as AgentDefinition;
      
      // Validate structure
      if (!imported.sections || !Array.isArray(imported.sections)) {
        throw new Error('Invalid definition: sections array is required');
      }

      // Validate each section has required fields
      for (const section of imported.sections) {
        if (!section.id || !section.title || !section.content) {
          throw new Error(`Invalid section: missing required fields (id, title, content)`);
        }
      }

      // Apply imported definition
      setAgentDefinition({
        ...imported,
        agentType, // Ensure agent type matches
      });
      setSections(imported.sections.sort((a, b) => (a.order || 0) - (b.order || 0)));
      toast.success('Agent definition imported successfully');
      return true;
    } catch (error: any) {
      console.error('Error importing definition:', error);
      toast.error(error.message || 'Failed to import agent definition');
      return false;
    }
  }, [agentType]);

  return {
    agentDefinition,
    sections,
    loading,
    saving,
    hasCustomConfig,
    loadDefaultTemplate,
    saveAgentConfig,
    resetToDefault,
    updateSection,
    addCustomSection,
    removeSection,
    exportDefinition,
    importDefinition,
  };
}
