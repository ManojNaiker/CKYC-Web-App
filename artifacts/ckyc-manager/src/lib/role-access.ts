export type AppRole = "admin" | "manager" | "viewer";

const routesByRole: Record<AppRole, string[]> = {
  viewer: ["/", "/clients"],
  manager: [
    "/",
    "/clients",
    "/requests",
    "/download-requests",
    "/ckyc-create-data",
  ],
  admin: [
    "/",
    "/clients",
    "/requests",
    "/download-requests",
    "/ckyc-create-data",
    "/finflux-update",
    "/manage-users",
    "/audit-trails",
  ],
};

export function canAccessPage(role: AppRole, path: string): boolean {
  return routesByRole[role].some(
    (base) => path === base || (base !== "/" && path.startsWith(`${base}/`)),
  );
}

export function roleLabel(role: AppRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}