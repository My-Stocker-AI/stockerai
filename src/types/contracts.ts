/**
 * StockerAI Data Contracts - TypeScript Interfaces
 *
 * Based on: /docs/DATA_CONTRACTS.md
 * Purpose: Define immutable contracts across all system boundaries
 *
 * CRITICAL PRINCIPLE: Separate immutable structure from mutable state
 */

// ============================================================================
// CORE DATA MODEL
// ============================================================================

/**
 * Route - Immutable Structure
 *
 * Contract Rules:
 * - total_machines MUST equal count of machines
 * - total_items MUST equal sum of all machine.total_items
 * - These fields NEVER change after creation
 */
export interface RouteContract {
  // IMMUTABLE - Set once at creation
  id: string;
  user_id: string;
  route_name: string;
  delivery_date: string; // ISO date string
  total_machines: number;
  total_items: number;
  created_at: string; // ISO timestamp

  // MUTABLE - Changes during execution
  status?: 'active' | 'completed' | 'archived';
}

/**
 * Machine Status
 */
export type MachineStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

/**
 * Machine - Immutable Structure + Mutable State
 *
 * Contract Rules:
 * - total_items MUST equal count of items for this machine
 * - total_items NEVER changes
 * - completed_items starts at 0, increments per item (max = total_items)
 * - completed_items NEVER decrements
 * - completed_items NEVER carries over to next machine
 */
export interface MachineContract {
  // IMMUTABLE - Set once at creation
  id: string;
  route_id: string;
  machine_name: string;
  machine_number: number;
  location_name: string;
  sequence: number;
  total_items: number;
  created_at: string;

  // MUTABLE - Changes during execution
  status: MachineStatus;
  completed_items: number; // 0 → total_items
  skipped_at_item?: number; // If skipped mid-machine
}

/**
 * Item - Completely Immutable
 *
 * Contract Rules:
 * - Items are COMPLETELY immutable
 * - Each item belongs to exactly ONE machine
 * - Item count per machine NEVER changes
 */
export interface ItemContract {
  // ALL IMMUTABLE
  id: string;
  machine_id: string;
  product_name: string;
  quantity: number;
  slot: string;
  sequence: number;
  inventory_current: number;
  inventory_parlevel: number;
  created_at: string;
}

/**
 * Session State - Mutable Position Tracking
 *
 * Contract Rules:
 * - Session tracks POSITION, not structure
 * - current_machine_id MUST exist in route's machines
 * - Progress tracked via machines.completed_items (not session)
 * - NEVER store aggregate counters (derive from machines[])
 */
export interface SessionContract {
  session_id: string;
  user_id: string;
  route_id: string;
  current_machine_id: string;
  current_machine_index: number; // 1-based
  // REMOVED: current_item_index (migrated to machines.completed_items - 2026-01-31)
  completed: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// WORKFLOW CONTRACTS
// ============================================================================

/**
 * Action types for workflow outputs
 */
export type WorkflowAction =
  | 'machine_ready'
  | 'item_ready'
  | 'next_machine'
  | 'route_complete'
  | 'route_switched'
  | 'route_deleted'
  | 'status_report'
  | 'session_updated';

/**
 * Base Workflow Output Contract
 *
 * All workflows MUST return this structure at minimum
 */
export interface BaseWorkflowOutput {
  action: WorkflowAction;
  spoken: string; // REQUIRED - frontend MUST use this verbatim
  display_text?: string; // Optional - different text for screen
}

/**
 * set_route_sequence Output Contract
 */
export interface SetRouteSequenceOutput extends BaseWorkflowOutput {
  action: 'machine_ready';
  route_name: string;
  date: string;
  total_machines: number;
  total_items_in_route: number;
  machine_id: string;
  machine_name: string;
  machine_number: number;
  total_items_in_machine: number;
  machines: Array<{
    id: string;
    name: string;
    sequence: number;
    totalItems: number; // IMMUTABLE
    completedItems: number; // Always 0 at start
    status: 'pending';
    location: string;
  }>;
}

/**
 * start_machine Output Contract
 */
export interface StartMachineOutput extends BaseWorkflowOutput {
  action: 'item_ready';
  machine_id: string;
  machine_name: string;
  items_remaining: number; // Items LEFT on THIS machine
  item1: {
    product_name: string;
    quantity: number;
    slot: string;
    slot_spoken: string;
    inventory_current?: number;
    inventory_parlevel?: number;
  };
  item2?: {
    product_name: string;
    quantity: number;
    slot: string;
    slot_spoken: string;
    inventory_current?: number;
    inventory_parlevel?: number;
  };
}

/**
 * get_next_item Output Contract (item ready)
 */
export interface GetNextItemOutput extends BaseWorkflowOutput {
  action: 'item_ready';
  machine_id: string;
  items_remaining: number;
  item1: {
    product_name: string;
    quantity: number;
    slot: string;
    slot_spoken: string;
  };
  item2?: {
    product_name: string;
    quantity: number;
    slot: string;
    slot_spoken: string;
  };
}

/**
 * get_next_item Output Contract (machine complete)
 */
export interface NextMachineOutput extends BaseWorkflowOutput {
  action: 'next_machine';
  completed_machine?: string; // Machine just finished
  next_machine_id: string;
  next_machine: string;
  next_machine_number: number;
  next_location: string;
}

/**
 * skip_current_machine Output Contract
 */
export interface SkipMachineOutput extends BaseWorkflowOutput {
  action: 'next_machine' | 'route_complete';
  skipped_machine: string;
  next_machine_id?: string;
  next_machine?: string;
  next_machine_number?: number;
  next_location?: string;
  route_complete: boolean;
}

/**
 * go_back_to_skipped Output Contract
 */
export interface GoBackToSkippedOutput extends BaseWorkflowOutput {
  action: 'item_ready';
  machine_id: string;
  machine_name: string;
  items_remaining: number; // total_items - completed_items
  item1: {
    product_name: string;
    quantity: number;
    slot: string;
    slot_spoken: string;
  };
  item2?: {
    product_name: string;
    quantity: number;
    slot: string;
    slot_spoken: string;
  };
}

/**
 * Route Complete Output Contract
 */
export interface RouteCompleteOutput extends BaseWorkflowOutput {
  action: 'route_complete';
  route_complete: true;
}

/**
 * Union type for all workflow outputs
 */
export type WorkflowOutput =
  | SetRouteSequenceOutput
  | StartMachineOutput
  | GetNextItemOutput
  | NextMachineOutput
  | SkipMachineOutput
  | GoBackToSkippedOutput
  | RouteCompleteOutput;

// ============================================================================
// FRONTEND STATE CONTRACTS
// ============================================================================

/**
 * Machine State (Frontend)
 *
 * Contract Rules:
 * - totalItems is IMMUTABLE (from workflow)
 * - completedItems is MUTABLE (per machine, isolated)
 * - When transitioning machine, new machine starts with completedItems = 0
 */
export interface FrontendMachineState {
  id: string;
  name: string;
  location: string;
  sequence: number;
  totalItems: number; // IMMUTABLE
  completedItems: number; // MUTABLE, per-machine
  status: MachineStatus;
  skippedAtItem?: number;
}

/**
 * Current Item (Frontend)
 */
export interface FrontendCurrentItem {
  product: string;
  quantity: number;
  slot: string;
  slot_spoken: string;
  inventory_current?: number;
  inventory_parlevel?: number;
  machineName: string; // MUST track which machine
  items_remaining?: number;
  item_index?: number;
}

/**
 * Completed Item (Frontend)
 *
 * Contract Rules:
 * - MUST include machineName for attribution
 * - Used for "done" card display
 */
export interface FrontendCompletedItem {
  product: string;
  quantity: number;
  slot: string;
  machineName: string; // CRITICAL - tracks which machine
}

/**
 * Pending Machine Transition
 */
export interface PendingMachineTransition {
  nextMachineId: string;
  nextMachineName: string;
  nextMachineIndex: number;
}

/**
 * Route State (Frontend)
 *
 * Contract Rules:
 * - machines[] maintains INDEPENDENT completedItems per machine
 * - completedItems[] tracks ALL items with machine attribution
 * - currentMachineId MUST exist in machines[]
 */
export interface FrontendRouteState {
  routeId: string | null;
  routeName: string | null;
  routeDate: string | null;
  totalMachines: number;

  // Machine list with independent counters
  machines: FrontendMachineState[];

  // Current position
  currentMachineId: string | null;
  currentMachineIndex: number;
  currentMachineName: string;
  currentMachineTotalItems: number;
  currentMachineItemsRemaining: number;

  // Current items (1 or 2 for 2-pick mode)
  currentItem: FrontendCurrentItem | null;
  currentItem2: FrontendCurrentItem | null;

  // Aggregate completed items (with machine attribution)
  completedItems: FrontendCompletedItem[];

  // State flags
  completed: boolean;
  pendingMachineTransition: PendingMachineTransition | null;
}

// ============================================================================
// VALIDATION ERROR TYPES
// ============================================================================

/**
 * Contract Violation Error
 */
export class ContractViolationError extends Error {
  constructor(
    public contractName: string,
    public rule: string,
    public actual: any,
    public expected?: any
  ) {
    super(`Contract violation in ${contractName}: ${rule}`);
    this.name = 'ContractViolationError';
  }
}

/**
 * Validation Result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ContractViolationError[];
  warnings?: string[];
}

// ============================================================================
// BOUNDARY VALIDATION REQUIREMENTS
// ============================================================================

/**
 * Workflow Output Validation Requirements
 */
export interface WorkflowValidationRequirements {
  // Required fields based on action
  requiredFields: Record<WorkflowAction, string[]>;

  // Field type validations
  typeValidations: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;

  // Range validations
  rangeValidations: Record<string, { min?: number; max?: number }>;

  // Immutability checks
  immutableFields: string[];
}

/**
 * Frontend State Validation Requirements
 */
export interface StateValidationRequirements {
  // Per-machine isolation checks
  machineIsolationChecks: boolean;

  // Immutability checks
  totalItemsImmutable: boolean;

  // Counter validation
  completedItemsNonNegative: boolean;
  completedItemsLessThanTotal: boolean;
}

// ============================================================================
// AI TEXT GENERATION RULES
// ============================================================================

/**
 * Actions that MUST use workflow.spoken (no AI generation)
 */
export const WORKFLOW_TEXT_ACTIONS: WorkflowAction[] = [
  'machine_ready',
  'item_ready',
  'next_machine',
  'route_complete',
  'route_switched',
  'route_deleted',
];

/**
 * Actions where AI CAN generate text
 */
export const AI_GENERATION_ALLOWED_ACTIONS: WorkflowAction[] = ['status_report'];

/**
 * Text Source Decision
 */
export type TextSource = 'workflow_spoken' | 'ai_generated';

export function getTextSource(action: WorkflowAction): TextSource {
  return WORKFLOW_TEXT_ACTIONS.includes(action) ? 'workflow_spoken' : 'ai_generated';
}
