import type { AppUser } from "@workspace/db";

export function toAppUserResponse(user: AppUser) {
  return {
    userId: user.clerkUserId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  };
}