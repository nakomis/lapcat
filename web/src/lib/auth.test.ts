import type { AuthContextProps } from 'react-oidc-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Config from '@/config/config';
import { logoutUrl, oidcConfig, signOut } from './auth';

// Realistic values: the committed template's <PLACEHOLDERS> are not valid URLs.
vi.mock('@/config/config', () => ({
  default: {
    env: 'sandbox',
    aws: { region: 'eu-west-2' },
    cognito: {
      authority: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_TEST',
      userPoolId: 'eu-west-2_TEST',
      userPoolClientId: 'web-client-id',
      cognitoDomain: 'login.sandbox.nakomis.com',
      redirectUri: 'https://lapcat.sandbox.nakomis.com/loggedin',
      logoutUri: 'https://lapcat.sandbox.nakomis.com/logout',
    },
    api: { apiUrl: 'https://api.lapcat.sandbox.nakomis.com' },
  },
}));

describe('oidcConfig', () => {
  it('maps the Cognito config onto OIDC parameters', () => {
    expect(oidcConfig.authority).toBe(Config.cognito.authority);
    expect(oidcConfig.client_id).toBe(Config.cognito.userPoolClientId);
    expect(oidcConfig.redirect_uri).toBe(Config.cognito.redirectUri);
    expect(oidcConfig.post_logout_redirect_uri).toBe(Config.cognito.logoutUri);
    expect(oidcConfig.response_type).toBe('code');
  });

  it('requests only scopes the web client allows', () => {
    expect(oidcConfig.scope.split(' ').sort()).toEqual(['email', 'openid', 'profile']);
  });

  it('clears the IdP query string in onSigninCallback', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    oidcConfig.onSigninCallback();
    expect(replaceState).toHaveBeenCalledWith({}, document.title, '/');
    replaceState.mockRestore();
  });
});

describe('logoutUrl', () => {
  it('points at the hosted logout endpoint with client id and logout uri', () => {
    const url = new URL(logoutUrl());
    expect(url.origin + url.pathname).toBe(`https://${Config.cognito.cognitoDomain}/logout`);
    expect(url.searchParams.get('client_id')).toBe(Config.cognito.userPoolClientId);
    expect(url.searchParams.get('logout_uri')).toBe(Config.cognito.logoutUri);
  });
});

describe('signOut', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', { writable: true, value: { href: '' } });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
  });

  it('removes the user and redirects to the hosted logout endpoint', () => {
    const removeUser = vi.fn().mockResolvedValue(undefined);
    signOut({ removeUser } as unknown as AuthContextProps);

    expect(removeUser).toHaveBeenCalledOnce();
    expect(window.location.href).toBe(logoutUrl());
  });
});
