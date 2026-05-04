/**
 * Pure authorization predicate. Each runtime is responsible for fetching
 * `isAdmin` from auth_mcp.users (Node MCP via supabase service-role client,
 * Edge Functions via verified JWT or schema query). The decision itself
 * is identical: the actor must own the resource OR be a platform admin.
 */
export interface ActOnInput {
  actorId: string;
  ownerIds: ReadonlyArray<string | null | undefined>;
  isAdmin: boolean;
}

export function canActOn({ actorId, ownerIds, isAdmin }: ActOnInput): boolean {
  if (!actorId) return false;
  if (isAdmin) return true;
  return ownerIds.some((id) => id === actorId);
}

/**
 * Parse the result of selecting `is_platform_admin` from auth_mcp.users.
 * Centralized so every runtime treats the column the same way.
 */
export function parsePlatformAdminRow(row: { is_platform_admin?: boolean | null } | null | undefined): boolean {
  return Boolean(row?.is_platform_admin);
}
