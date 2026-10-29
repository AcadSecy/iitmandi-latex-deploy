<h1 align="center">
  <img src="doc/logo.png" alt="IIT Mandi LaTeX" width="420">
</h1>

<p align="center">Institute-hosted collaborative LaTeX platform for IIT Mandi</p>

IIT Mandi LaTeX gives students, researchers and staff real-time collaborative LaTeX editing with PDF preview and project history, hosted on Institute servers and open to IIT Mandi accounts. It is proposed by the UG Academic Council as an Institute-owned alternative to a commercial subscription.

## Roadmap

From the implementation plan of 30 September 2026:

| Month | Deliverables |
| --- | --- |
| October 2026 | Platform on the DCS server, Institute login, isolated compilation with a queue, templates |
| November 2026 | Comments and track changes, admin dashboard, quotas, waiting queue, backups (feature-complete by 30 November) |
| December 2026 | Pilot, 50-user load test, security review, documentation and handover to DCS (go-live recommendation by 31 December) |

Target capacity: about 3,500 registered and 50 simultaneous users, with a 60-second compile limit and a 500 MB default storage quota per user.

## Repository layout

| Path | Contents |
| --- | --- |
| `services/web` | Web app: UI, API, accounts, projects, admin |
| `services/clsi` | LaTeX compile service |
| `services/real-time`, `services/document-updater` | Real-time collaborative editing |
| `services/history-v1`, `services/project-history` | Project history |
| `services/docstore`, `services/filestore`, `services/chat`, `services/notifications` | Storage and supporting services |
| `services/git-bridge` | Git access to projects |
| `libraries/` | Shared packages used by the services |
| `server-ce/` | Dockerfiles, service scripts, nginx and runtime settings for the all-in-one image |
| `tools/branding/` | Logo generator and locale rebranding script ([README](tools/branding/README.md)) |

## Branches and upstream

- Development happens in the public repository [AcadSecy/iitmandi-latex-deploy](https://github.com/AcadSecy/iitmandi-latex-deploy). Anyone can fork it and open a pull request; collaborators can also create branches in it.
- `staging` is the test branch. Every commit on it is built for the Raspberry Pi test server and deployed there within the hour ([`deploy/pi`](deploy/pi/README.md)). It takes changes only through pull requests with an approval and a passing **Build and check**.
- `main` is what has been tried on the Pi and goes to production. Changes come from `staging` through pull requests.
- The `upstream` remote points at the open-source project this platform is built on (see [License](#license)). Merge it regularly to pick up security fixes:

  ```sh
  git fetch upstream
  git switch -c sync/upstream-$(date +%Y-%m-%d) main
  git merge upstream/main
  node tools/branding/rebrand-locales.mjs   # rebrand any new UI strings
  # resolve conflicts, then open a pull request
  ```

  The `upstream` remote is fetch-only.

## Building

The platform runs as two Docker images on Linux (Ubuntu 22.04 or 24.04): the app, and the git service "Latex X IIT-Mandi". Building on Windows is not supported; use a Linux machine or VM.

```sh
cd server-ce
make build-base        # system packages and TeX Live (slow, rarely needs rebuilding)
make build-community   # the application image
```

The image tags default to the upstream names (`sharelatex/sharelatex:<branch>-<commit>`); override them with `OVERLEAF_TAG=...` and `OVERLEAF_BASE_TAG=...`.

The git image is built from `services/git-bridge` (Java 21; its tests run in CI):

```sh
docker build -t iitmandi/latex-x-iit-mandi:<tag> services/git-bridge
```

The root `docker-compose.yml` is the upstream sample and still pulls the upstream image. The production setup for the DCS server (configuration, databases, secrets, backups) is in [`deploy/iitmandi`](deploy/iitmandi/README.md), and the test deployment on the Raspberry Pi in [`deploy/pi`](deploy/pi/README.md).

## Configuration

The image is configured with environment variables, using the upstream names (`OVERLEAF_*`). Settings specific to this platform:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OVERLEAF_APP_NAME` | `IIT Mandi LaTeX` | Name in the UI, page titles and emails |
| `OVERLEAF_SOURCE_CODE_URL` | `https://github.com/TayalAditya/iitmandi-latex` | Footer "Source code" link (see [License](#license)) |
| `OVERLEAF_NAV_TITLE` | unset | Show this text in the navbar instead of the logo |

`OVERLEAF_SITE_URL`, `OVERLEAF_ADMIN_EMAIL`, the email (SMTP) settings and the rest are described in [`server-ce/config/settings.js`](server-ce/config/settings.js).

## Branding

Colours follow the IIT Mandi website: navy `#00237d` for the navbar and a blue accent scale built on it, with orange `#ff652f` in the logo. Success states stay green. See [tools/branding](tools/branding/README.md) for the palette, the logo generator and how to change the name.

Internal identifiers (package names such as `@overleaf/settings`, `OVERLEAF_*` variables, file paths inside the image) keep their upstream names so that upstream fixes still merge cleanly. Users do not see them.

## License

This platform is based on [Overleaf Community Edition](https://github.com/overleaf/overleaf), copyright (c) Overleaf, 2014-2025, and is released under the GNU Affero General Public License v3.0. See [`LICENSE`](LICENSE). Changes for IIT Mandi are copyright (c) 2026 their contributors and are released under the same license.

The AGPL requires that everyone who uses a modified version over a network can get its source code. The footer links to `OVERLEAF_SOURCE_CODE_URL` for this. This repository is private, so before go-live point that variable at a copy of the source that all users can reach.

"Overleaf" is a trademark of its owner. This platform does not use the name or logo in its interface.

## Institute server deployment

LaTeX runs on the x86_64 instance at http://172.19.17.79:8080.
Pull requests still target `staging`; the checked amd64 image is deployed by the server.
See [deploy/server](deploy/server/README.md) for migration, updates and rollback.
