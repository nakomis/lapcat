import type { ReactNode } from 'react';
import { useAuth } from 'react-oidc-context';
import AppHeader from '@/components/AppHeader';
import Footer from '@/components/Footer';
import SignInScreen from '@/components/SignInScreen';
import { Spinner } from '@/components/ui/spinner';
import { signOut } from '@/lib/auth';

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex min-h-screen items-center justify-center gap-2 p-8">
      {children}
    </div>
  );
}

function Home() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <CenteredMessage>
        <Spinner /> Loading…
      </CenteredMessage>
    );
  }

  if (auth.error) {
    return <CenteredMessage>Error: {auth.error.message}</CenteredMessage>;
  }

  if (!auth.isAuthenticated) {
    return <SignInScreen onSignIn={() => void auth.signinRedirect()} />;
  }

  const email = auth.user?.profile.email;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader onSignOut={() => signOut(auth)} />
      <main className="mx-auto w-full max-w-2xl flex-1 p-8">
        <h1 className="mb-6 text-2xl font-normal">{email ? `Hello ${email}` : 'Hello'}</h1>
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          Your swims will appear here
        </p>
      </main>
      <Footer />
    </div>
  );
}

export default Home;
