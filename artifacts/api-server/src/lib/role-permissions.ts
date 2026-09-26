import type { AppRole } from "@workspace/db";

const isRead = (method: string) => method === "GET" || method === "HEAD";
const isPath = (path: string, base: string) =>
  path === base || path.startsWith(`${base}/`);

export function canAccessApiPath(
  role: AppRole,
  path: string,
  method: string,
): boolean {
  if (path === "/auth/me") return true;

  if (isPath(path, "/admin")) return role === "admin";

  if (path === "/dashboard/summary") return true;

  if (isPath(path, "/clients")) {
    return isRead(method) || role === "manager" || role === "admin";
  }

  if (
    isPath(path, "/ckyc/requests") ||
    isPath(path, "/ckyc/download-requests") ||
    isPath(path, "/ckyc/create-data")
  ) {
    return role === "manager" || role === "admin";
  }

  if (isPath(path, "/finflux")) return role === "admin";

  return false;
}