# Contributing to IIT Mandi LaTeX

## Workflow

Work happens in issues. Each piece of work has one, with its owner as the assignee, and belongs to a track issue (Track A to F, from the volunteer booklet) where the plan and the progress live.

1. **Plan first.** Before writing code for a track, post a short plan (half a page) on its track issue: what you will change, where, and how you will test it. Start once a maintainer has agreed, usually within two days.
2. **Branch from `staging`**, named after the track and the issue: `b/chapter-compile`, `e/load-test`. Collaborators push branches to this repository; anyone else works in a fork.
3. **One issue, one pull request, into `staging`.** Write `Closes #<issue>` in the description. Keep it to that issue: no unrelated reformatting or drive-by changes.
4. **Test it yourself before you push.** Run the platform with your change ([deploy/pi/README.md](deploy/pi/README.md), "Run it on your own machine") and use the feature the way a student or admin would. Check that what was working before still works: log in, open a project, compile.
5. **Show it.** Every pull request includes screenshots or a short screen recording (drag a GIF or MP4 into the description) of the change working on a running platform: before and after for anything visible, the terminal output or test results for scripts and backend work, the report or dashboard for operations work. A pull request without this is not reviewed.
6. **Checks and review.** The **Build and check** workflow builds the Pi image and runs the template, start-up, login, compile and sandbox checks on every pull request into `staging`. It must pass, and a maintainer must approve, before the merge.
7. **Check it on the test server.** A merge into `staging` reaches the Raspberry Pi test server within about 15 minutes. Open it there, check your change once more, and post a screenshot on the issue before closing it. If the merge broke something, fix it with a new pull request straight away.
8. `main` takes tested batches from `staging`, also through pull requests.

### Using AI tools

AI tools are fine for understanding the code, exploring options and drafting. They are not a way to finish an issue: a vague prompt whose output is pasted into a pull request is not a contribution. You must understand every line you submit and be able to explain it in review. Write the pull request description yourself, keep the change to the issue, and check that every function, setting and file you use really exists. Pull requests that read as unchecked AI output are closed without review.

### Credit

Every merged pull request counts as your contribution to IIT Mandi LaTeX: it is in the history under your name and on the repository's contributor list. Use your own GitHub account and real name in your commits.

## Guidelines

- **User-facing text:** never hard-code the product name. In locale strings use `__appName__`; in server code use `settings.appName`. `node tools/branding/rebrand-locales.mjs --check` (run in CI) catches upstream strings that slip through.
- **Colours:** use the semantic tokens in `services/web/frontend/stylesheets/foundations/colors.scss` (`--bg-accent-01`, `--content-positive`, ...) rather than raw hex values. See [tools/branding](tools/branding/README.md).
- **Upstream code:** keep changes to upstream files small and focused, so security fixes from upstream keep merging cleanly. Prefer configuration and new modules over editing shared code.
- **Secrets:** never commit `.env` files, passwords, tokens or certificates.

## Reporting bugs and security issues

Open an issue with the bug report template. Report security issues privately to the maintainers instead of opening a public issue.

## License

By contributing you agree that your contribution is released under the GNU Affero General Public License v3.0, the license of this project (see [`LICENSE`](LICENSE)).
