import type { AuthContextProps } from 'react-oidc-context';
import Config from '@/config/config';

/**
 * OIDC config for the shared Cognito user pool, passed to <AuthProvider>.
 * Authorisation code flow; oidc-client-ts adds PKCE automatically. The scopes
 * must be a subset of those allowed on the `lapcat-web-{env}` app client.
 */
export const oidcConfig = {
  authority: Config.cognito.authority,
  client_id: Config.cognito.userPoolClientId,
  redirect_uri: Config.cognito.redirectUri,
  post_logout_redirect_uri: Config.cognito.logoutUri,
  response_type: 'code',
  scope: 'openid email profile',
  // Strip the ?code=…&state=… query the IdP appends, leaving a clean URL.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, '/');
  },
};

/** URL of Cognito's hosted logout endpoint, which clears the IdP session. */
export function logoutUrl(): string {
  return (
    `https://${Config.cognito.cognitoDomain}/logout` +
    `?client_id=${encodeURIComponent(Config.cognito.userPoolClientId)}` +
    `&logout_uri=${encodeURIComponent(Config.cognito.logoutUri)}`
  );
}

/**
 * Sign out: clear the local session, then redirect to Cognito's hosted logout
 * endpoint so the IdP session is cleared too.
 */
export function signOut(auth: AuthContextProps) {
  void auth.removeUser();
  window.location.href = logoutUrl();
}
