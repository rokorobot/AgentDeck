
export interface ValidationError {
  field: string;
  message: string;
}

export function validateManifest(config: any): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  // 1. Basic properties
  if (!config) {
    errors.push({ field: 'root', message: 'Configuration object is missing' });
    return { valid: false, errors };
  }

  if (config.schemaVersion !== 'agentdeck.workspace.v2') {
    errors.push({ field: 'schemaVersion', message: 'Schema version must be agentdeck.workspace.v2' });
  }

  if (!config.id || typeof config.id !== 'string' || !config.id.trim()) {
    errors.push({ field: 'id', message: 'Workspace ID is required and must be a non-empty string' });
  } else if (!/^[a-z0-9-_]+$/.test(config.id)) {
    errors.push({ field: 'id', message: 'Workspace ID can only contain lowercase letters, numbers, dashes, and underscores' });
  }

  if (!config.name || typeof config.name !== 'string' || !config.name.trim()) {
    errors.push({ field: 'name', message: 'Workspace Name is required' });
  }

  if (!config.previewUrl || typeof config.previewUrl !== 'string' || !config.previewUrl.trim()) {
    errors.push({ field: 'previewUrl', message: 'Preview URL is required' });
  } else {
    const isLocal = config.previewUrl.startsWith('http://localhost') || 
                    config.previewUrl.startsWith('https://localhost') ||
                    config.previewUrl.startsWith('http://127.0.0.1') ||
                    config.previewUrl.startsWith('https://127.0.0.1');
    if (!isLocal) {
      errors.push({ field: 'previewUrl', message: 'Preview URL must start with http://localhost or http://127.0.0.1 (external browsing is blocked)' });
    }
  }

  // 2. Services validation
  if (config.services) {
    if (!Array.isArray(config.services)) {
      errors.push({ field: 'services', message: 'Services must be an array' });
    } else {
      const serviceIds = new Set<string>();
      config.services.forEach((service: any, index: number) => {
        const pathPrefix = `services[${index}]`;
        
        if (!service.id || typeof service.id !== 'string' || !service.id.trim()) {
          errors.push({ field: `${pathPrefix}.id`, message: 'Service ID is required' });
        } else {
          if (serviceIds.has(service.id)) {
            errors.push({ field: `${pathPrefix}.id`, message: `Duplicate service ID: ${service.id}` });
          }
          serviceIds.add(service.id);
        }

        if (!service.label || typeof service.label !== 'string' || !service.label.trim()) {
          errors.push({ field: `${pathPrefix}.label`, message: 'Service Label is required' });
        }

        if (!service.command || typeof service.command !== 'string' || !service.command.trim()) {
          errors.push({ field: `${pathPrefix}.command`, message: 'Service Command is required' });
        }

        if (!service.shell || typeof service.shell !== 'string' || !service.shell.trim()) {
          errors.push({ field: `${pathPrefix}.shell`, message: 'Service Shell is required (e.g. powershell.exe or cmd.exe)' });
        }
      });
    }
  }

  // 3. Quick Actions validation
  if (config.quickActions) {
    if (!Array.isArray(config.quickActions)) {
      errors.push({ field: 'quickActions', message: 'Quick actions must be an array' });
    } else {
      const actionIds = new Set<string>();
      config.quickActions.forEach((action: any, index: number) => {
        const pathPrefix = `quickActions[${index}]`;

        if (!action.id || typeof action.id !== 'string' || !action.id.trim()) {
          errors.push({ field: `${pathPrefix}.id`, message: 'Action ID is required' });
        } else {
          if (actionIds.has(action.id)) {
            errors.push({ field: `${pathPrefix}.id`, message: `Duplicate action ID: ${action.id}` });
          }
          actionIds.add(action.id);
        }

        if (!action.label || typeof action.label !== 'string' || !action.label.trim()) {
          errors.push({ field: `${pathPrefix}.label`, message: 'Action Label is required' });
        }

        const validTypes = ['openFolder', 'previewUrl', 'command', 'startService'];
        if (!action.type || !validTypes.includes(action.type)) {
          errors.push({ field: `${pathPrefix}.type`, message: `Action Type must be one of: ${validTypes.join(', ')}` });
        } else {
          if (action.type === 'previewUrl' && (!action.url || typeof action.url !== 'string' || !action.url.trim())) {
            errors.push({ field: `${pathPrefix}.url`, message: 'URL is required for previewUrl action type' });
          }
          if (action.type === 'command' && (!action.command || typeof action.command !== 'string' || !action.command.trim())) {
            errors.push({ field: `${pathPrefix}.command`, message: 'Command script is required for command action type' });
          }
          if (action.type === 'startService') {
            if (!action.serviceId || typeof action.serviceId !== 'string' || !action.serviceId.trim()) {
              errors.push({ field: `${pathPrefix}.serviceId`, message: 'Service ID target is required for startService action type' });
            } else if (config.services && Array.isArray(config.services)) {
              const serviceExists = config.services.some((s: any) => s.id === action.serviceId);
              if (!serviceExists) {
                errors.push({ field: `${pathPrefix}.serviceId`, message: `Target service "${action.serviceId}" does not exist in services list` });
              }
            }
          }
        }
      });
    }
  }

  // 4. Terminals validation
  if (config.terminals) {
    if (!Array.isArray(config.terminals)) {
      errors.push({ field: 'terminals', message: 'Terminals must be an array' });
    } else if (config.terminals.length === 0) {
      errors.push({ field: 'terminals', message: 'At least one terminal session preset is required' });
    } else {
      config.terminals.forEach((term: any, index: number) => {
        const pathPrefix = `terminals[${index}]`;

        if (!term.name || typeof term.name !== 'string' || !term.name.trim()) {
          errors.push({ field: `${pathPrefix}.name`, message: 'Terminal Name is required' });
        }

        if (!term.shell || typeof term.shell !== 'string' || !term.shell.trim()) {
          errors.push({ field: `${pathPrefix}.shell`, message: 'Terminal Shell executable is required' });
        }
      });
    }
  } else {
    errors.push({ field: 'terminals', message: 'Terminals section is required' });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
