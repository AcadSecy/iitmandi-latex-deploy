# Latex X IIT-Mandi: git access to IIT Mandi LaTeX projects.
#
#   docker build -t iitmandi/latex-x-iit-mandi:<tag> services/git-bridge
#
# Same layout as the upstream git-bridge image, so the Toolkit runs it
# unchanged: as root with /server-pro-start.sh, which prepares the data
# directory and drops to the "node" user. On its own it starts /start.sh as
# "node". Tests run in CI, not here.

FROM maven:3.9.16-amazoncorretto-21-alpine AS build
WORKDIR /build
# Dependencies in their own layer, so code changes don't download them again
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src/main src/main
RUN mvn -B -q -Dmaven.test.skip=true package \
  && cp target/writelatex-git-bridge-1.0-SNAPSHOT-jar-with-dependencies.jar /git-bridge.jar

# envsubst with ${VAR:-default} support, used by start.sh
FROM golang:1.27.1-alpine3.24 AS envsubst
RUN CGO_ENABLED=0 go install github.com/a8m/envsubst/cmd/envsubst@v1.4.3

FROM amazoncorretto:21.0.12-alpine3.24
LABEL org.opencontainers.image.title="Latex X IIT-Mandi" \
  org.opencontainers.image.description="Git access to IIT Mandi LaTeX projects" \
  org.opencontainers.image.source="https://github.com/TayalAditya/iitmandi-latex" \
  org.opencontainers.image.licenses="MIT"

RUN apk add --update --no-cache bash git sqlite procps htop net-tools jemalloc util-linux
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2
RUN adduser -D node

WORKDIR /
COPY --from=build /git-bridge.jar /git-bridge.jar
COPY --from=envsubst /go/bin/envsubst /opt/envsubst
COPY conf/envsubst_template.json /envsubst_template.json
COPY start.sh server-pro-start.sh /
RUN chmod 755 /opt/envsubst /start.sh /server-pro-start.sh \
  && mkdir /conf \
  && chown node:node /conf

USER node
EXPOSE 8000
# /status answers without the web app, so this only checks the bridge itself
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${GIT_BRIDGE_PORT:-8000}/status" || exit 1
CMD ["/start.sh"]
