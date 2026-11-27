# Compile and partial PDF review verification

On 16 November 2026, verified PR #61 code head
`c14da04097b734a87eb0255e4f2e55864bbe8971`, which includes PR #55.

| Check | Result |
| --- | --- |
| CLSI CI unit list: DockerRunner, LatexRunner, CompileManager, RequestParser, Schemas, OutputFileFinder | 202 passed |
| Frontend human-readable logs and failed-compile banner | 20 passed |
| Headless Chrome: `pdf-preview.spec.tsx`, retries disabled | 50 passed, 0 failed, 0 skipped |

The viewer run covers Stop with logs open/closed, timeout, Back to PDF, a failed
compile after a partial PDF, no-output cancellation, stale last-good PDF recovery,
and the ordinary compile/cache/auto-compile behavior. The three timing assertions
now match the elapsed seconds in the button's accessible name; they passed in
this run. The old PR description's 47/50 result is superseded by this result.

CompileManager tests exercise a complete real four-page PDF, truncation halfway
and just before `%%EOF`, absent and zero-byte output, unreadable output, and
cleanup ordering before output collection. Source review confirms the Docker
compile suite additionally covers XeLaTeX good/fail/fixed sequences, pdfLaTeX and
LuaLaTeX image placeholders, the LaTeX DVI route, timeout and Stop. The Docker
suite was not rerun locally because Docker is unavailable here; its existing CI
and author evidence remain separate from the local checks above.

These are component and unit checks, not an authenticated production-stack smoke
test. Keep #60 open until maintainer review and the deployed editor check. Merge
#55 before #61, as the latter is stacked on the former.
