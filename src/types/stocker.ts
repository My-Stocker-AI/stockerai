// Stocker AI Types

export type VoiceStatus = 'idle' | 'listening' | 'speaking' | 'thinking' | 'paused' | 'error';

export interface RouteItem {
  product: string;
  quantity: number;
  slot: string;
  slot_spoken?: string;
}

export interface RouteState {
  routeName: string | null;
  routeDate: string | null;
  totalMachines: number;
  currentMachineIndex: number;
  currentMachineName: string | null;
  currentItem: RouteItem | null;
  completedItems: RouteItem[];
  completed: boolean;
}

export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}
