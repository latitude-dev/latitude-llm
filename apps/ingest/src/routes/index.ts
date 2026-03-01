import type { Hono } from "hono";
import { registerHealthRoute } from "./health.js";

export interface RoutesContext {
  app: Hono;
}

export const registerRoutes = (context: RoutesContext) => {
  registerHealthRoute(context);
  // Additional routes can be registered here
};
