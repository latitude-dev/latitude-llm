import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@repo/ui/styles/globals.css";
import LoginPage from "./routes/login.js";
import SignupPage from "./routes/signup.js";

// Root route
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// Login route
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

// Signup route
const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  component: SignupPage,
});

// Home route (placeholder)
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold">Latitude Dashboard</h1>
        <p className="text-muted-foreground">Welcome to your Latitude dashboard</p>
      </div>
    </div>
  ),
});

// Create route tree first
const routeTree = rootRoute.addChildren([loginRoute, signupRoute, homeRoute]);

// Create router with logging
const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => {
    const currentPath = window.location.pathname;
    console.error(`[Router 404] Path not found: ${currentPath}`);
    console.error(`[Router 404] Full URL: ${window.location.href}`);
    console.error("[Router 404] Available routes: /, /login, /signup");
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <h1 className="text-2xl font-bold">404 - Page Not Found</h1>
        <p className="text-muted-foreground">Path: {currentPath}</p>
        <a href="/" className="text-primary underline">
          Go home
        </a>
      </div>
    );
  },
});

// Log router state changes using simpler approach
router.subscribe("onBeforeLoad", () => {
  console.log(`[Router] Before load: ${window.location.pathname}`);
});

router.subscribe("onResolved", () => {
  console.log(`[Router] Resolved: ${window.location.pathname}`);
});

// Register for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element");
}

const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
