# Contributing to IIT Mandi LaTeX

## Workflow

1. Create a branch from `main`: `feat/...`, `fix/...` or `sync/upstream-...`.
2. Keep each pull request to one change. Describe what you tested.
3. CI must pass before merging. At least one other developer reviews each pull request.

## Guidelines

- **User-facing text:** never hard-code the product name. In locale strings use `__appName__`; in server code use `settings.appName`. `node tools/branding/rebrand-locales.mjs --check` (run in CI) catches upstream strings that slip through.
- **Colours:** use the semantic tokens in `services/web/frontend/stylesheets/foundations/colors.scss` (`--bg-accent-01`, `--content-positive`, ...) rather than raw hex values. See [tools/branding](tools/branding/README.md).
- **Upstream code:** keep changes to upstream files small and focused, so security fixes from upstream keep merging cleanly. Prefer configuration and new modules over editing shared code.
- **Secrets:** never commit `.env` files, passwords, tokens or certificates.

## Reporting bugs and security issues

Open an issue with the bug report template. Report security issues privately to the maintainers instead of opening a public issue.

## License

By contributing you agree that your contribution is released under the GNU Affero General Public License v3.0, the license of this project (see [`LICENSE`](LICENSE)).
