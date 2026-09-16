import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { setIdToken } from '@/api/auth-token';

/**
 * Keeps the API bearer token in step with the OIDC session. Renders nothing —
 * mount it once inside <AuthProvider>. Sends the ID token, not the access
 * token (see api/auth-token.ts).
 */
function AuthTokenSync() {
  const auth = useAuth();

  useEffect(() => {
    setIdToken(auth.user?.id_token);
  }, [auth.user?.id_token]);

  return null;
}

export default AuthTokenSync;
