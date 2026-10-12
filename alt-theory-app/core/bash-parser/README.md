# bash-parser (vendored)

Pure-TypeScript bash parser from Moonshot AI's Kimi Code
(`packages/tree-sitter-bash`, MIT, see `LICENSE`), commit
`be7d5f5fea7800778e4660cd5f36780ba783bddd`. Node types match
tree-sitter-bash 0.25.0; `parse()` never throws and runs under a node/time
budget.

Local change: internal `#/…` and extensionless imports rewritten to
relative `.js` so the files compile with the app's own tsc. Nothing else
is changed — update by copying the upstream `src/` files again and
reapplying the import rewrite. Only the syntax tree is used here; Alt
Theory's approval policy lives in `../shell-evidence.ts` and
`../approval-boundary.ts`, not Kimi's command policy.
