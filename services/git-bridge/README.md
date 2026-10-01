# Latex X IIT-Mandi (git bridge)

Lets people clone, pull and push IIT Mandi LaTeX projects with git. The Maven
artifact keeps its historical name, `writelatex-git-bridge`.

## Docker

The `Dockerfile` builds the jar and the runtime image. Its layout matches the
upstream git-bridge image, so the Toolkit runs it unchanged: as root with
`/server-pro-start.sh`, which prepares the data directory and then runs as
`node`. From the repository root:

```bash
docker build -t iitmandi/latex-x-iit-mandi:<tag> services/git-bridge
```

At start, `start.sh` renders `/conf/runtime.json` from
`conf/envsubst_template.json` using `GIT_BRIDGE_*` environment variables. These
decide what git users see:

| Variable | Default | Used for |
| --- | --- | --- |
| `GIT_BRIDGE_SERVICE_NAME` | `Latex X IIT-Mandi` | The name in messages |
| `GIT_BRIDGE_SITE_URL` | `OVERLEAF_SITE_URL` without a trailing `/` | Links to the help page (`/learn`), account settings and example git URLs |
| `GIT_BRIDGE_SUPPORT_EMAIL` | `OVERLEAF_ADMIN_EMAIL` | The contact address in error messages |

Values are inserted into JSON strings as they are, so they must not contain
`"` or `\`.

## Native install

### Required packages

- `maven` (for building, running tests and packaging)
- JDK 21 (for compiling and running)

### Commands

To be run from the base directory:

**Build jar**:
`mvn package`

**Run tests**:
`mvn test`

**Clean**:
`mvn clean`

To be run from the dev-environment:

**Build jar**:
`bin/run git-bridge make package`

**Run tests**:
`bin/run git-bridge make test`

**Clean**:
`bin/run git-bridge make clean`

### Installation

Install dependencies:

```
sudo apt-get update
sudo apt-get install -y maven openjdk-21-jdk
```

Create a config file according to the format below.

Run `mvn package` to build, test, and package it into a jar at `target/writelatex-git-bridge-1.0-SNAPSHOT-jar-with-dependencies.jar`.

Use `java -jar <path_to_jar> <path_to_config_file>` to run the server.

## Runtime Configuration

The configuration file is in `.json` format.

    {
        "port" (int): the port number,
        "rootGitDirectory" (string): the directory in which to store
                                     git repos and the db/atts,
        "apiBaseUrl" (string): base url for the snapshot api,
        "username" (string, optional): username for http basic auth,
        "password" (string, optional): password for http basic auth,
        "postbackBaseUrl" (string): the postback url,
        "serviceName" (string): the name shown to git users,
        "siteUrl" (string, optional): public address of the site,
                                      without trailing slash; used for
                                      help and settings links,
        "supportEmail" (string, optional): contact address shown in
                                           error messages,
        "oauth2Server" (string): oauth2 server,
                                 with protocol and
                                 without trailing slash,
                                 null or missing if oauth2 shouldn't be used
        },
        "repoStore" (object, optional): { configure the repo store
            "maxFileSize" (long, optional): maximum size of a file, inclusive
        },
        "swapStore" (object, optional): { the place to swap projects to.
                                          if null, type defaults to
                                          "noop"
            "type" (string): "s3", "memory", "noop" (not recommended),
            "awsAccessKey" (string, optional): only for s3,
            "awsSecret" (string, optional): only for s3,
            "s3BucketName" (string, optional): only for s3
        },
        "swapJob" (object, optional): { configure the project
                                        swapping job.
                                        if null, defaults to no-op
            "minProjects" (int64): lower bound on number of projects
                                   present. The swap job will never go
                                   below this, regardless of what the
                                   watermark shows. Regardless, if
                                   minProjects prevents an eviction,
                                   the swap job will WARN,
            "lowGiB" (int32): the low watermark for swapping,
                              i.e. swap until disk usage is below this,
            "highGiB" (int32): the high watermark for swapping,
                               i.e. start swapping when
                               disk usage becomes this,
            "intervalMillis" (int64): amount of time in between running
                                      swap job and checking watermarks.
                                      3600000 is 1 hour
        }
    }

You have to restart the server for configuration changes to take effect.

## Creating OAuth app

In dev-env, run the following command in mongo to create the oauth application
for git-bridge.

```
db.oauthApplications.insert({
  "clientSecret" : "v1.G5HHTXfxsJMmfFhSar9QhJLg/u4KpGpYOdPGwoKdZXk=",
  "grants" : [
    "password"
  ],
  "id" : "264c723c925c13590880751f861f13084934030c13b4452901e73bdfab226edc",
  "name" : "Git Bridge",
  "redirectUris" : [],
  "scopes" : [
    "git_bridge"
  ]
})
```
