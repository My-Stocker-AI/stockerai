/**
 * ROUTE PLAN — what a test route contains, decided before anything touches the database.
 *
 * THE PROBLEM THIS EXISTS TO FIX
 *
 * Browser tests ran against whatever routes happened to be sitting in the live database,
 * including four routes Davy abandoned mid-pick. globalSetup.ts said so out loud:
 * "Using existing routes in database - no setup needed".
 *
 * That makes a passing test meaningless. A test that says "the app announces the first item"
 * passes if the data happens to line up and fails if someone picked an item yesterday — and
 * neither outcome tells you anything about the code. It also makes the proof bar impossible:
 * you cannot show a test failing on the old code and passing on the new one when the ground
 * shifts underneath both runs.
 *
 * This module is the pure half — it decides the CONTENT of a throwaway route (names, slots,
 * quantities, sequences) with no clock, no randomness, and no network. Same inputs, same route,
 * every time. seedRoute.ts does the writing; this decides what gets written.
 */

/** Every fixture route name starts with this so strays from a crashed run are identifiable. */
export const FIXTURE_ROUTE_PREFIX = 'E2E FIXTURE';

/**
 * What a test SAYS to start the route: "start Fixture route".
 *
 * The backend picks a route by exact name first, then by loose match (machines.py:294-303),
 * so this short handle finds "E2E FIXTURE w0-abc123" without the test needing to know the run
 * id. Kept as a constant because it only works while it stays inside the prefix — which the
 * unit tests hold in place.
 */
export const FIXTURE_SPOKEN_HANDLE = 'Fixture';

/**
 * Quantities cycle through these so a voice assertion can tell items apart by what the app
 * says out loud. Deliberately not all the same, and deliberately not sequential.
 */
export const QUANTITY_CYCLE = [3, 5, 2, 4, 1];

export interface RoutePlanOptions {
  /** Unique per test run — namespaces the route so concurrent/leftover data can never collide. */
  runId: string;
  userId: string;
  /** 'YYYY-MM-DD'. Required: a plan must never read the clock, or it isn't reproducible. */
  deliveryDate: string;
  machines?: number;
  itemsPerMachine?: number;
  driverName?: string;
}

export interface PlannedRoute {
  user_id: string;
  route_name: string;
  delivery_date: string;
  total_machines: number;
  total_items: number;
  driver_name: string;
}

export interface PlannedMachine {
  route_name: string;
  machine_name: string;
  location_name: string;
  machine_number: number;
  sequence: number;
  status: 'pending';
  total_items: number;
  completed_items: number;
}

export interface PlannedItem {
  /** Which machine this belongs to — resolved to a real machine_id at insert time. */
  machineSequence: number;
  machine_name: string;
  product_name: string;
  quantity: number;
  slot: string;
  sequence: number;
  status: 'pending';
  inventory_current: number;
  inventory_parlevel: number;
}

export interface RoutePlan {
  routeName: string;
  route: PlannedRoute;
  machines: PlannedMachine[];
  items: PlannedItem[];
}

export function buildRoutePlan(options: RoutePlanOptions): RoutePlan {
  const {
    runId,
    userId,
    deliveryDate,
    machines: machineCount = 3,
    itemsPerMachine = 5,
    driverName = 'Fixture Driver',
  } = options;

  if (!runId || !runId.trim()) {
    throw new Error('buildRoutePlan: runId is required — it is what keeps runs from colliding');
  }
  if (!userId || !userId.trim()) {
    throw new Error('buildRoutePlan: userId is required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    throw new Error(`buildRoutePlan: deliveryDate must be YYYY-MM-DD, got "${deliveryDate}"`);
  }
  if (machineCount < 1) {
    throw new Error('buildRoutePlan: a route needs at least one machine');
  }
  if (itemsPerMachine < 1) {
    throw new Error('buildRoutePlan: a machine needs at least one item');
  }

  const routeName = `${FIXTURE_ROUTE_PREFIX} ${runId}`;
  const totalItems = machineCount * itemsPerMachine;

  const plannedMachines: PlannedMachine[] = [];
  const plannedItems: PlannedItem[] = [];

  for (let m = 1; m <= machineCount; m++) {
    const machineName = `Fixture Machine ${m}`;

    plannedMachines.push({
      route_name: routeName,
      machine_name: machineName,
      location_name: `Fixture Location ${m}`,
      machine_number: 100 + m,
      sequence: m,
      status: 'pending',
      total_items: itemsPerMachine,
      completed_items: 0,
    });

    for (let s = 1; s <= itemsPerMachine; s++) {
      plannedItems.push({
        machineSequence: m,
        machine_name: machineName,
        product_name: `Fixture Product ${m}-${s}`,
        quantity: QUANTITY_CYCLE[(s - 1) % QUANTITY_CYCLE.length],
        slot: `A${s}`,
        sequence: s,
        status: 'pending',
        inventory_current: 0,
        inventory_parlevel: 10,
      });
    }
  }

  return {
    routeName,
    route: {
      user_id: userId,
      route_name: routeName,
      delivery_date: deliveryDate,
      total_machines: machineCount,
      total_items: totalItems,
      driver_name: driverName,
    },
    machines: plannedMachines,
    items: plannedItems,
  };
}

/**
 * True when a route name was created by this fixture system.
 * The teardown sweeper uses this — it is the only thing standing between a cleanup pass and
 * somebody's real route.
 */
export function isFixtureRouteName(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.startsWith(`${FIXTURE_ROUTE_PREFIX} `);
}
