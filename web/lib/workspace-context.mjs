import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage();
export function validateUid(uid) {
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid))
    throw new Error("Invalid account identity.");
  return uid;
}
export function withWorkspace(identity, fn) {
  validateUid(identity?.uid);
  return context.run(Object.freeze({ ...identity }), fn);
}
export function workspaceIdentity() {
  const value = context.getStore();
  if (!value)
    throw new Error("An authenticated workspace context is required.");
  return value;
}
export function workspaceDocument(identity) {
  return identity.legacy
    ? "snaglyOwner/workspace"
    : `snaglyUsers/${validateUid(identity.uid)}`;
}
