import { describe, expect, it } from 'vitest';
import Config from './config';
import template from './config.json.template?raw';

describe('Config', () => {
  it('exposes every section the app reads', () => {
    expect(Config.cognito.authority).toEqual(expect.any(String));
    expect(Config.cognito.userPoolClientId).toEqual(expect.any(String));
    expect(Config.cognito.cognitoDomain).toEqual(expect.any(String));
    expect(Config.cognito.redirectUri).toEqual(expect.any(String));
    expect(Config.cognito.logoutUri).toEqual(expect.any(String));
    expect(Config.api.apiUrl).toEqual(expect.any(String));
  });

  it('has the same shape as the committed template set-config.sh fills in', () => {
    const shape = (o: unknown): unknown =>
      o && typeof o === 'object'
        ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)]))
        : typeof o;
    expect(shape(Config)).toEqual(shape(JSON.parse(template)));
  });
});
