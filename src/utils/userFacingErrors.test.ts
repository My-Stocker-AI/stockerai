import { describe, expect, it } from 'vitest';
import {
  isConnectionError,
  pickingConnectionMessage,
  uploadConnectionMessage,
  uploadResponseMessage,
} from './userFacingErrors';

describe('user-facing failure messages', () => {
  it.each(['Failed to fetch', 'Connection timeout', 'network error', 'offline'])(
    'recognizes %j as a connection failure',
    message => expect(isConnectionError(new Error(message))).toBe(true),
  );

  it('tells an offline uploader that no route was added and what to do', () => {
    const message = uploadConnectionMessage(new Error('Failed to fetch'), false);
    expect(message).toContain('route was not uploaded');
    expect(message).toContain('Check Wi-Fi or mobile data');
  });

  it('turns authentication and server failures into actionable upload messages', () => {
    expect(uploadResponseMessage(401)).toContain('Sign in again');
    expect(uploadResponseMessage(503)).toContain('route was not added');
    expect(uploadResponseMessage(422, 'This report format is not supported')).toBe('This report format is not supported');
  });

  it('warns a picker not to blindly repeat an uncertain command', () => {
    expect(pickingConnectionMessage).toContain('last command may not have completed');
    expect(pickingConnectionMessage).toContain('Check the item still shown');
  });
});
