/**
 * StockerAI Contract Validation - Runtime Enforcement
 *
 * Based on: /docs/DATA_CONTRACTS.md
 * Purpose: Validate data contracts at all system boundaries
 *
 * CRITICAL: These validations prevent:
 * - Machine completedItems contamination
 * - Immutable field modifications
 * - Missing workflow.spoken text
 * - Invalid state transitions
 */

import {
  WorkflowOutput,
  WorkflowAction,
  FrontendRouteState,
  FrontendMachineState,
  ContractViolationError,
  ValidationResult,
  getTextSource,
} from '../types/contracts';

// ============================================================================
// WORKFLOW OUTPUT VALIDATION
// ============================================================================

/**
 * Validate workflow output contract
 *
 * Checks:
 * - Required fields present
 * - spoken text exists
 * - Counter values valid
 * - Action-specific requirements
 */
export function validateWorkflowOutput(output: any, toolName: string): ValidationResult {
  const errors: ContractViolationError[] = [];

  // 1. Must have action field
  if (!output.action) {
    errors.push(
      new ContractViolationError('WorkflowOutput', 'action field required', output.action, 'string')
    );
  }

  // 2. Must have spoken text (CRITICAL - fixes Bug #1)
  if (!output.spoken || output.spoken.trim() === '') {
    errors.push(
      new ContractViolationError(
        'WorkflowOutput',
        'spoken text required - frontend MUST NOT generate own text',
        output.spoken,
        'non-empty string'
      )
    );
    console.error(`[ContractViolation] ${toolName} missing spoken text:`, output);
  }

  // 3. Validate action-specific requirements
  if (output.action) {
    validateActionSpecificFields(output, errors);
  }

  // 4. Validate counter fields (never negative)
  validateCounterFields(output, errors);

  // 5. Validate machine totalItems if present (never 0 or negative)
  if (output.machine_total_items !== undefined) {
    if (output.machine_total_items <= 0) {
      errors.push(
        new ContractViolationError(
          'WorkflowOutput',
          'machine_total_items must be > 0',
          output.machine_total_items,
          '> 0'
        )
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate action-specific required fields
 */
function validateActionSpecificFields(output: any, errors: ContractViolationError[]): void {
  const action = output.action as WorkflowAction;

  switch (action) {
    case 'machine_ready':
      requireFields(output, ['route_name', 'machine_id', 'machine_name', 'machines'], errors);
      break;

    case 'item_ready':
      requireFields(output, ['machine_id', 'items_remaining', 'item1'], errors);
      break;

    case 'next_machine':
      requireFields(output, ['next_machine_id', 'next_machine', 'next_location'], errors);
      // If skipped_machine present, spoken MUST say "skipped" not "complete"
      if (output.skipped_machine && output.spoken) {
        const spokenLower = output.spoken.toLowerCase();
        if (spokenLower.includes('complete') && !spokenLower.includes('skipped')) {
          errors.push(
            new ContractViolationError(
              'SkipMachineOutput',
              'Skip action MUST say "skipped" not "complete" in spoken text',
              output.spoken,
              'text containing "skipped"'
            )
          );
        }
      }
      // If completed_machine present, spoken MUST say "complete"
      if (output.completed_machine && output.spoken) {
        const spokenLower = output.spoken.toLowerCase();
        if (!spokenLower.includes('complete')) {
          errors.push(
            new ContractViolationError(
              'NextMachineOutput',
              'Machine complete action MUST say "complete" in spoken text',
              output.spoken,
              'text containing "complete"'
            )
          );
        }
      }
      break;

    case 'route_complete':
      // Route complete must have route_complete: true
      if (!output.route_complete) {
        errors.push(
          new ContractViolationError(
            'RouteCompleteOutput',
            'route_complete must be true',
            output.route_complete,
            true
          )
        );
      }
      break;
  }
}

/**
 * Require specific fields to be present
 */
function requireFields(output: any, fields: string[], errors: ContractViolationError[]): void {
  for (const field of fields) {
    if (output[field] === undefined || output[field] === null) {
      errors.push(
        new ContractViolationError('WorkflowOutput', `${field} is required`, output[field], 'non-null value')
      );
    }
  }
}

/**
 * Validate counter fields (must be >= 0)
 */
function validateCounterFields(output: any, errors: ContractViolationError[]): void {
  const counterFields = ['items_remaining', 'completed_items', 'total_items'];

  for (const field of counterFields) {
    if (output[field] !== undefined && output[field] < 0) {
      errors.push(
        new ContractViolationError('WorkflowOutput', `${field} cannot be negative`, output[field], '>= 0')
      );
    }
  }
}

// ============================================================================
// FRONTEND STATE VALIDATION
// ============================================================================

/**
 * Validate frontend state update
 *
 * Checks:
 * - Immutable fields unchanged
 * - Per-machine counter isolation
 * - Valid transitions
 */
export function validateStateUpdate(
  prev: FrontendRouteState,
  next: FrontendRouteState
): ValidationResult {
  const errors: ContractViolationError[] = [];

  // 1. Validate machine totalItems immutability
  validateMachineTotalItemsImmutable(prev, next, errors);

  // 2. Validate per-machine isolation (no cross-contamination)
  validateMachineIsolation(next, errors);

  // 3. Validate counters (non-negative, within bounds)
  validateMachineCounters(next, errors);

  // 4. Validate current machine exists in machines array
  validateCurrentMachineExists(next, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate machine totalItems never changes (IMMUTABLE)
 */
function validateMachineTotalItemsImmutable(
  prev: FrontendRouteState,
  next: FrontendRouteState,
  errors: ContractViolationError[]
): void {
  for (const nextMachine of next.machines) {
    const prevMachine = prev.machines.find((m) => m.id === nextMachine.id);
    if (prevMachine && prevMachine.totalItems !== nextMachine.totalItems) {
      errors.push(
        new ContractViolationError(
          'FrontendMachineState',
          `Machine ${nextMachine.name} totalItems NEVER changes (immutable)`,
          nextMachine.totalItems,
          prevMachine.totalItems
        )
      );
      console.error(
        `[ContractViolation] Machine ${nextMachine.name} totalItems changed: ${prevMachine.totalItems} → ${nextMachine.totalItems}`
      );
    }
  }
}

/**
 * Validate per-machine counter isolation
 *
 * When starting new machine, completedItems should start at 0 (unless resuming skipped)
 */
function validateMachineIsolation(state: FrontendRouteState, errors: ContractViolationError[]): void {
  if (!state.currentMachineId) return;

  const currentMachine = state.machines.find((m) => m.id === state.currentMachineId);
  if (!currentMachine) return;

  // If machine is pending and we just started it, completedItems should be 0
  // (unless it was skipped previously and we're going back)
  if (currentMachine.status === 'pending' && currentMachine.completedItems !== 0) {
    errors.push(
      new ContractViolationError(
        'FrontendMachineState',
        `New machine ${currentMachine.name} should start with completedItems = 0`,
        currentMachine.completedItems,
        0
      )
    );
  }

  // If machine was skipped and we're going back, completedItems should match skippedAtItem
  if (
    currentMachine.status === 'in_progress' &&
    currentMachine.skippedAtItem !== undefined &&
    currentMachine.completedItems !== currentMachine.skippedAtItem
  ) {
    // This is actually OK - we're resuming from where we left off
    // Just log for visibility
    console.log(
      `[MachineResume] Resuming ${currentMachine.name} from item ${currentMachine.completedItems} (was skipped at ${currentMachine.skippedAtItem})`
    );
  }
}

/**
 * Validate machine counters are within valid bounds
 */
function validateMachineCounters(state: FrontendRouteState, errors: ContractViolationError[]): void {
  for (const machine of state.machines) {
    // completedItems must be >= 0
    if (machine.completedItems < 0) {
      errors.push(
        new ContractViolationError(
          'FrontendMachineState',
          `Machine ${machine.name} completedItems cannot be negative`,
          machine.completedItems,
          '>= 0'
        )
      );
    }

    // completedItems must be <= totalItems
    if (machine.completedItems > machine.totalItems) {
      errors.push(
        new ContractViolationError(
          'FrontendMachineState',
          `Machine ${machine.name} completedItems (${machine.completedItems}) > totalItems (${machine.totalItems})`,
          machine.completedItems,
          `<= ${machine.totalItems}`
        )
      );
    }

    // totalItems must be > 0
    if (machine.totalItems <= 0) {
      errors.push(
        new ContractViolationError(
          'FrontendMachineState',
          `Machine ${machine.name} totalItems must be > 0`,
          machine.totalItems,
          '> 0'
        )
      );
    }
  }
}

/**
 * Validate current machine exists in machines array
 */
function validateCurrentMachineExists(state: FrontendRouteState, errors: ContractViolationError[]): void {
  if (!state.currentMachineId) return;

  const exists = state.machines.some((m) => m.id === state.currentMachineId);
  if (!exists) {
    errors.push(
      new ContractViolationError(
        'FrontendRouteState',
        'currentMachineId must exist in machines array',
        state.currentMachineId,
        'valid machine ID from machines[]'
      )
    );
    console.error(
      `[ContractViolation] currentMachineId ${state.currentMachineId} not found in machines:`,
      state.machines.map((m) => m.id)
    );
  }
}

// ============================================================================
// AI TEXT GENERATION VALIDATION
// ============================================================================

/**
 * Validate text source decision
 *
 * Ensures AI uses workflow.spoken for workflow actions
 * and only generates text for status queries
 */
export function validateTextSource(action: WorkflowAction, usingWorkflowText: boolean): ValidationResult {
  const errors: ContractViolationError[] = [];
  const expectedSource = getTextSource(action);

  if (expectedSource === 'workflow_spoken' && !usingWorkflowText) {
    errors.push(
      new ContractViolationError(
        'AITextGeneration',
        `Action ${action} MUST use workflow.spoken text (no AI generation)`,
        'ai_generated',
        'workflow_spoken'
      )
    );
    console.error(
      `[ContractViolation] AI generated text for ${action} - should use workflow.spoken instead`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// LOGGING & REPORTING
// ============================================================================

/**
 * Log validation result
 *
 * Errors are logged to console with full context
 */
export function logValidationResult(context: string, result: ValidationResult): void {
  if (!result.valid) {
    console.error(`[ContractValidation] ${context} - ${result.errors.length} violation(s):`);
    for (const error of result.errors) {
      console.error(`  - ${error.contractName}: ${error.rule}`);
      console.error(`    Actual: ${JSON.stringify(error.actual)}`);
      if (error.expected !== undefined) {
        console.error(`    Expected: ${JSON.stringify(error.expected)}`);
      }
    }
  }

  if (result.warnings && result.warnings.length > 0) {
    console.warn(`[ContractValidation] ${context} - ${result.warnings.length} warning(s):`);
    for (const warning of result.warnings) {
      console.warn(`  - ${warning}`);
    }
  }
}

/**
 * Assert validation passes (throw on failure)
 *
 * Use in development/testing to catch contract violations immediately
 */
export function assertValidation(context: string, result: ValidationResult): void {
  if (!result.valid) {
    logValidationResult(context, result);
    throw result.errors[0]; // Throw first error
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if action requires workflow.spoken text
 */
export function requiresWorkflowSpoken(action: WorkflowAction): boolean {
  return getTextSource(action) === 'workflow_spoken';
}

/**
 * Validate machine transition is allowed
 */
export function validateMachineTransition(
  fromMachineId: string | null,
  toMachineId: string,
  machines: FrontendMachineState[]
): ValidationResult {
  const errors: ContractViolationError[] = [];

  // Target machine must exist
  const toMachine = machines.find((m) => m.id === toMachineId);
  if (!toMachine) {
    errors.push(
      new ContractViolationError(
        'MachineTransition',
        'Target machine does not exist',
        toMachineId,
        'valid machine ID'
      )
    );
  }

  // If transitioning from a machine, mark it as completed/skipped
  if (fromMachineId) {
    const fromMachine = machines.find((m) => m.id === fromMachineId);
    if (fromMachine && fromMachine.status === 'in_progress') {
      // This is OK - we're transitioning away from in-progress machine
      // Frontend should mark it as completed or skipped
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
