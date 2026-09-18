import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import Home from '@/routes/Home';
import LoggedIn from '@/routes/LoggedIn';
import Logout from '@/routes/Logout';
import SwimDetail from '@/routes/SwimDetail';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
});

const loggedInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/loggedin',
  component: LoggedIn,
});

const logoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/logout',
  component: Logout,
});

const swimDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/swims/$swimId',
  component: SwimDetail,
});

const routeTree = rootRoute.addChildren([indexRoute, loggedInRoute, logoutRoute, swimDetailRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
