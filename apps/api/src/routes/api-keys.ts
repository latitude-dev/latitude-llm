import {
  ApiKeyAlreadyRevokedError,
  ApiKeyNotFoundError,
  type GenerateApiKeyInput,
  InvalidApiKeyNameError,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
} from "@domain/api-keys";
import { ApiKeyId, NotFoundError, OrganizationId, generateId } from "@domain/shared-kernel";
import { createRepositories } from "@platform/db-postgres";
import { Hono } from "hono";
import { getPostgresClient } from "../clients.js";
import { extractParam, runUseCase } from "../lib/effect-utils.js";
import { mapErrorToResponse } from "../lib/error-mapper.js";

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
    if (!organizationId) return c.json({ error: "Organization ID is required" }, 400);

    const body = (await c.req.json()) as {
      readonly name: string;
    };

    const input: GenerateApiKeyInput = {
      id: ApiKeyId(generateId()),
      organizationId,
      name: body.name,
    };

    const result = await runUseCase(generateApiKeyUseCase(repos.apiKey)(input));

    if (!result.success) {
      const error = result.error;
      if (error instanceof InvalidApiKeyNameError) {
        return c.json({ error: error.reason, field: "name" }, 400);
      }
      return mapErrorToResponse(c, error);
    }

    return c.json(result.data, 201);
  });

  // GET /organizations/:organizationId/api-keys - List API keys
  app.get("/", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId);
    if (!organizationId) return c.json({ error: "Organization ID is required" }, 400);

    const result = await runUseCase(repos.apiKey.findByOrganizationId(organizationId));

    if (!result.success) return mapErrorToResponse(c, result.error);
    return c.json({ apiKeys: result.data }, 200);
  });

  // DELETE /organizations/:organizationId/api-keys/:id - Revoke API key
  app.delete("/:id", async (c) => {
    const id = extractParam(c, "id", ApiKeyId);
    if (!id) return c.json({ error: "API Key ID is required" }, 400);

    const result = await runUseCase(revokeApiKeyUseCase(repos.apiKey)({ id }));

    if (!result.success) {
      const error = result.error;
      if (error instanceof ApiKeyNotFoundError) {
        return c.json({ error: "API key not found" }, 404);
      }
      if (error instanceof ApiKeyAlreadyRevokedError) {
        return c.json({ error: "API key already revoked" }, 409);
      }
      if (error instanceof NotFoundError) {
        return c.json({ error: "API key not found" }, 404);
      }
      return mapErrorToResponse(c, error);
    }

    return c.body(null, 204);
  });

  return app;
};
