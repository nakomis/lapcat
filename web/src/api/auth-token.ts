/**
 * Module-scoped holder for the current OIDC **ID token**.
 *
 * API calls (swim graphs, coming later) run outside React, so they cannot call
 * `useAuth()`. <AuthTokenSync> pushes the latest token in here whenever the
 * Cognito session changes, and request code reads it back via `authHeaders()`.
 *
 * Why the ID token and not the access token: a Cognito access token carries
 * no `email` claim. The ID token does, and its `aud` is the web client id,
 * which the API's JWT authoriser lists as an accepted audience.
 */
let idToken: string | undefined;

export function setIdToken(token: string | undefined): void {
  idToken = token;
}

export function getIdToken(): string | undefined {
  return idToken;
}

/** Authorization header for an API request, or `{}` when there's no session. */
export function authHeaders(): Record<string, string> {
  return idToken ? { authorization: `Bearer ${idToken}` } : {};
}
