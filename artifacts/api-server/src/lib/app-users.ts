import type { AppUser } from "@workspace/db";

export function toAppUserResponse(user: AppUser) {
  return {
    userId: user.clerkUserId,
    email: user.email,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  };
}