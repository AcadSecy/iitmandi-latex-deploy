# Help guide source and deployment checks

Review on 16 November 2026:

| Named action | Source check | Deployment acceptance |
| --- | --- | --- |
| Format → Page setup | `modules/page-setup/frontend/js/format-menu-sections.ts`; controller and toolbar slots are registered in settings | Pending authenticated check |
| Reviewing / Reviewer | Toolbar and share controls check project `trackChangesVisible` and `trackChanges`; availability is project-specific | Guide must qualify availability; pending authenticated check |
| Restore project | `features/history/components/change-list/dropdown/menu-item/restore-project.tsx`; mutations require write permission | Guide must require edit access; pending authenticated check |
| Git | Help section is conditional on `settings.enableGitBridge` | Conditional rendering checked locally; bridge operation pending |
| Templates | Eight named families exist under `modules/iitmandi-templates/templates` | Deployed gallery and institutional acceptance pending |
| Compile pause | Requires nonzero queue slots and turn duration | Hide pause FAQ when disabled; active execution budget differs from wall-clock waiting |
| Partial PDF | Depends on readable pages actually being produced; first-page failure can have no PDF | PR #61 adds viewer recovery; do not guarantee a PDF |
| Chapter selection | Merged chapter-compile menu chooses a chapter per browser/project without changing shared source | Prefer this over asking students to add `includeonly` |
| Report a problem | PR #57 adds preview route through a registered footer link | Show preview instructions only when that route's footer link is present |

The Institute server answered on 16 November, but `/learn` redirected to login.
No authenticated deployment flags, feature availability, real mail delivery or
new-volunteer follow-along were verified in this pass. Source checks and local
render checks do not substitute for that acceptance. Keep #9 open for it.

Local actual-template renders passed at 1440 px and 390 px with queue, Git and
the support route both enabled and disabled: the sections/links follow their
settings, chapter instructions use the menu, Reviewing is qualified, and the
page has no horizontal overflow. The focused UI detector and whitespace check
were clean. The marketing layout was replaced with a synthetic frame for these
render checks; no deployed feature availability is inferred from them.
