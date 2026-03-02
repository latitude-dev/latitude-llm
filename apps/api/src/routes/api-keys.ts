import {
  type GenerateApiKeyInput,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
} from "@domain/api-keys";
import { ApiKeyId, OrganizationId, generateId } from "@domain/shared-kernel";
import { createRepositories } from "@platform/db-postgres";
import { Effect } from "effect";
import { Hono } from "hono";
import { getPostgresClient } from "../clients.js";
import { BadRequestError } from "../errors.ts";
import { extractParam } from "../lib/effect-utils.js";

/**
 * API Key routes
 *
 * - POST /organizations/:organizationId/api-keys - Generate API key
 * - GET /organizations/:organizationId/api-keys - List API keys
 * - DELETE /organizations/:organizationId/api-keys/:id - Revoke API key
 */

export const createApiKeysRoutes = () => {
  const repos = createRepositories(getPostgresClient().db);
  const app = new Hono();

  // POST /organizations/:organizationId/api-keys - Generate API key
  app.post("/", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId);
    if (!organizationId) {
      throw new BadRequestError({ httpMessage: "Organization ID is required" });
    }

    const body = (await c.req.json()) as {
      readonly name: string;
    };

    const input: GenerateApiKeyInput = {
      id: ApiKeyId(generateId()),
      organizationId,
      name: body.name,
    };

    const apiKey = await Effect.runPromise(generateApiKeyUseCase(repos.apiKey)(input));
    return c.json(apiKey, 201);
  });

  // GET /organizations/:organizationId/api-keys - List API keys
  app.get("/", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId);
    if (!organizationId) {
      throw new BadRequestError({ httpMessage: "Organization ID is required" });
    }

    const apiKeys = await Effect.runPromise(repos.apiKey.findByOrganizationId(organizationId));
    return c.json({ apiKeys }, 200);
  });

  // DELETE /organizations/:organizationId/api-keys/:id - Revoke API key
  app.delete("/:id", async (c) => {
    const id = extractParam(c, "id", ApiKeyId);
    if (!id) {
      throw new BadRequestError({ httpMessage: "API Key ID is required" });
    }

    await Effect.runPromise(revokeApiKeyUseCase(repos.apiKey)({ id }));
    return c.body(null, 204);
  });

  return app;
};
