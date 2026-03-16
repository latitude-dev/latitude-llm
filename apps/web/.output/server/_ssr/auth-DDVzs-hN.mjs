import { o as OrganizationId, G as UserId } from "./index-D2KejSDZ.mjs";
import { a as ensureSession } from "./middlewares-BgvwNBR1.mjs";
class UnauthorizedError {
  _tag = "HttpUnauthorizedError";
  httpStatus = 401;
  httpMessage;
  constructor(options = {}) {
    this.httpMessage = options.httpMessage ?? "Authentication required";
  }
}
const getSessionUserId = (session) => {
  if (typeof session !== "object" || session === null) {
    return null;
  }
  const user = Reflect.get(session, "user");
  if (typeof user !== "object" || user === null) {
    return null;
  }
  const id = Reflect.get(user, "id");
  return typeof id === "string" ? id : null;
};
const getSessionOrganizationId = (session) => {
  if (typeof session !== "object" || session === null) {
    return null;
  }
  const sessionData = Reflect.get(session, "session");
  if (typeof sessionData !== "object" || sessionData === null) {
    return null;
  }
  const organizationId = Reflect.get(sessionData, "activeOrganizationId");
  return typeof organizationId === "string" ? organizationId : null;
};
const requireSession = async () => {
  const session = await ensureSession();
  const userId = getSessionUserId(session);
  if (!userId) {
    throw new UnauthorizedError({ httpMessage: "No user in session" });
  }
  const organizationId = getSessionOrganizationId(session);
  if (!organizationId) {
    throw new UnauthorizedError({ httpMessage: "No active organization in session" });
  }
  return { userId: UserId(userId), organizationId: OrganizationId(organizationId) };
};
export {
  requireSession as r
};
