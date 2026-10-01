export type PasswordFlow = 'invite' | 'recovery';

export const PASSWORD_FLOW_STORAGE_KEY = 'stockerai:password-flow';

const normalizePasswordFlow = (value: string | null): PasswordFlow | null => {
  if (value === 'invite') return 'invite';
  if (value === 'recovery' || value === 'reset_password') return 'recovery';
  return null;
};

const paramsFromHash = (hash: string) => {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(value);
};

export const passwordFlowFromUrl = (search: string, hash: string): PasswordFlow | null => {
  const queryFlow = normalizePasswordFlow(new URLSearchParams(search).get('type'));
  return queryFlow ?? normalizePasswordFlow(paramsFromHash(hash).get('type'));
};

export const authCallbackValue = (
  name: string,
  search: string,
  hash: string,
): string | null => (
  new URLSearchParams(search).get(name) ?? paramsFromHash(hash).get(name)
);

export const rememberPasswordFlow = (flow: PasswordFlow) => {
  window.sessionStorage.setItem(PASSWORD_FLOW_STORAGE_KEY, flow);
};

export const readPasswordFlow = (): PasswordFlow | null => (
  normalizePasswordFlow(window.sessionStorage.getItem(PASSWORD_FLOW_STORAGE_KEY))
);

export const clearPasswordFlow = () => {
  window.sessionStorage.removeItem(PASSWORD_FLOW_STORAGE_KEY);
};
