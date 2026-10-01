// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  PASSWORD_FLOW_STORAGE_KEY,
  authCallbackValue,
  clearPasswordFlow,
  passwordFlowFromUrl,
  readPasswordFlow,
  rememberPasswordFlow,
} from './authRecovery';

afterEach(() => window.sessionStorage.clear());

describe('password recovery URL contract', () => {
  it('recognizes query, legacy hash and reset-password aliases', () => {
    expect(passwordFlowFromUrl('?type=recovery', '')).toBe('recovery');
    expect(passwordFlowFromUrl('', '#access_token=fixture&type=invite')).toBe('invite');
    expect(passwordFlowFromUrl('?type=reset_password', '')).toBe('recovery');
    expect(passwordFlowFromUrl('', '#type=signup')).toBeNull();
  });

  it('reads callback errors from query or implicit-flow hashes', () => {
    expect(authCallbackValue('error_description', '?error_description=query', '')).toBe('query');
    expect(authCallbackValue('error', '', '#error=access_denied')).toBe('access_denied');
  });

  it('stores only a valid tab-scoped password flow and clears it', () => {
    rememberPasswordFlow('recovery');
    expect(readPasswordFlow()).toBe('recovery');
    clearPasswordFlow();
    expect(readPasswordFlow()).toBeNull();

    window.sessionStorage.setItem(PASSWORD_FLOW_STORAGE_KEY, 'unexpected');
    expect(readPasswordFlow()).toBeNull();
  });
});
