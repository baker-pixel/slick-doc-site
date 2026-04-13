

## Plan: Fix Supabase client scoping in generate-social-image

### Problem
`_sb` is declared inside the `generateSingleImage` helper (line 10) but referenced in the outer `serve` handler's catch block (line 87). This causes a runtime `ReferenceError`. The client in the helper is also unused there.

### Fix
1. Remove the `_sb` declaration from inside `generateSingleImage` (line 10)
2. Add a `const _sb = createClient(...)` at the top of the `serve` handler, inside the outer scope (right after line 38, before the `try`)

One file changed: `supabase/functions/generate-social-image/index.ts`

