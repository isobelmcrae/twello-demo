# Twello architecture

One installation serves a team. People sign in with Better Auth. Boards stay private until their owner grants access.

## Design choice

| Candidate | Benefit | Cost |
| --- | --- | --- |
| Server actions and pg | Permission checks and transactions live together. No separate request API. | Next.js clients only. |
| REST and Drizzle | Reusable HTTP API and generated query types. | More handlers and schema integration for this app. |

Use server actions and pg. Both independent sketches agreed on board membership, task versions, board locks for ordering, and hashed invite tokens. Keep those constraints. A future external API can call the same board operations.

## Ownership

`lib/types.ts` defines the shared UI contract. `lib/boards.ts` owns board reads and writes. `lib/actions.ts` validates the server action boundary. `lib/auth.ts` owns identity. `lib/mail.ts` sends transactional messages. `components/workspace` owns interactive UI.

Owners manage access. Editors change tasks and columns. Viewers read. Membership and task updates are checked in the database transaction. A task edit supplies its last version. A stale edit returns a conflict and preserves the user's draft.

Share links require login. Email invitations also require the signed-in account to match the recipient and verify their email address. Revoking a link prevents new joins. Removing an existing member revokes their current access.

Clients refresh authenticated snapshots every three seconds and on focus. This provides shared updates without a separate socket service.
