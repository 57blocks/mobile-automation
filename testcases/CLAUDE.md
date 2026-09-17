# testcases/

Follow the house style in `testcases/README.md` exactly when writing or editing anything in
this directory — case anatomy, the atomic-case rule, the honest-assertion rule, and the
`**Automated:**` mapping.

@README.md

A case file and its spec are 1:1 and same-named: `testcases/{platform}/<name>.md` ↔
`test/{platform}/specs/<name>.spec.ts`. The header table (**Spec** / **Account** /
**Runs on** / **Feature flags**) is authoritative — it says which spec automates the case,
what account it needs, whether a simulator can run it, and which flag preset defines the
variant. Change the table when the spec changes, not afterwards.
