import { testDatabase } from './fixtures/testSafety';

export default async function globalSetup() {
  testDatabase(); // Fail closed; never discover or sweep rows from earlier runs.
}
