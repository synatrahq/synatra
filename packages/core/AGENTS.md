## Structure

```
src/
├── principal.ts   # Principal scope (user/system/public)
├── database.ts    # Drizzle ORM wrapper
├── schema/        # Drizzle table definitions
└── {entity}.ts    # Domain entities
```

## Naming Convention

Function names follow `{verb}{Entity}{Target?}` pattern:

- `createAgent`, `updateThread`, `deleteUser`
- `findOrganizationById`, `getAgentBySlug`
- `listMembers`, `countChannels`

| Method                                  | Behavior                                   |
| --------------------------------------- | ------------------------------------------ |
| `get{Entity}ById`                       | Throws `createError("NotFoundError", ...)` |
| `find{Entity}ById`, `find{Entity}By{X}` | Returns `null`                             |

## Patterns

- All `get{Entity}ById`/`find{Entity}ById` scope by `principal.orgId()`
- All public functions export a Zod schema and validate input with `schema.parse()`
- Use `withDb()` for queries, `withTx()` for transactions
