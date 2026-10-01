import { promisify } from 'node:util'
import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import Docker from 'dockerode'
import crypto from 'node:crypto'
import async from 'async'
import LockManager from './DockerLockManager.js'
import Path from 'node:path'
import _ from 'lodash'
import { getLastProjectAccessTime } from './LastProjectAccess.js'
import GracefulStop from './GracefulStop.js'
import Errors from './Errors.js'

const dockerode = new Docker()

const ONE_HOUR_IN_MS = 60 * 60 * 1000
logger.debug('using docker runner')

let containerMonitorTimeout
let containerMonitorInterval
let pausedContainerSweepTimeout

// Containers that are being waited for, by name: their time budget, whether
// they are paused, and how they were stopped.
const runningContainers = new Map()

const { gracePeriodMs } = GracefulStop

// A paused compile that is never resumed (for example because web restarted)
// is stopped after this long.
function maxPausedMs() {
  return Settings.clsi?.docker?.maxPausedTime ?? 10 * 60 * 1000
}

// Calls a callback-style dockerode method and returns a promise.
function dockerCall(object, method, ...args) {
  return new Promise((resolve, reject) => {
    object[method](...args, (error, result) =>
      error ? reject(error) : resolve(result)
    )
  })
}

const DockerRunner = {
  run(
    projectId,
    command,
    directory,
    image,
    timeout,
    environment,
    compileGroup,
    cwd,
    callback
  ) {
    command = command.map(arg =>
      arg.toString().replace('$COMPILE_DIR', '/compile')
    )
    if (image == null) {
      image = Settings.clsi.docker.image
    }

    if (
      Settings.clsi.docker.allowedImages &&
      !Settings.clsi.docker.allowedImages.includes(image)
    ) {
      return callback(new Error('image not allowed'))
    }

    if (Settings.texliveImageNameOveride != null && compileGroup != 'conversions') {
      const img = Path.basename(image)
      image = `${Settings.texliveImageNameOveride}/${img}`
    }

    if (compileGroup === 'synctex-output') {
      // In: directory = '/overleaf/services/clsi/output/projectId-userId/generated-files/buildId'
      //             directory.split('/').slice(-3) === 'projectId-userId/generated-files/buildId'
      //  sandboxedCompilesHostDirOutput = '/host/output'
      // Out:                  directory = '/host/output/projectId-userId/generated-files/buildId'
      directory = Path.join(
        Settings.path.sandboxedCompilesHostDirOutput,
        ...directory.split('/').slice(-3)
      )
    } else {
      // In:   directory = '/overleaf/services/clsi/compiles/projectId-userId'
      //                       Path.basename(directory) === 'projectId-userId'
      //  sandboxedCompilesHostDirCompiles = '/host/compiles'
      // Out:                    directory = '/host/compiles/projectId-userId'
      directory = Path.join(
        Settings.path.sandboxedCompilesHostDirCompiles,
        Path.basename(directory)
      )
    }

    const volumes = { [directory]: '/compile' }
    if (
      compileGroup === 'synctex' ||
      compileGroup === 'synctex-output' ||
      compileGroup === 'wordcount'
    ) {
      volumes[directory] += ':ro'
    }

    const options = DockerRunner._getContainerOptions(
      command,
      image,
      volumes,
      timeout,
      environment,
      compileGroup,
      cwd
    )
    const fingerprint = DockerRunner._fingerprintContainer(options)
    const name = `project-${projectId}-${fingerprint}`
    options.name = name

    // logOptions = _.clone(options)
    // logOptions?.HostConfig?.SecurityOpt = "secomp used, removed in logging"
    logger.debug({ projectId }, 'running docker container')
    DockerRunner._runAndWaitForContainer(
      options,
      volumes,
      timeout,
      (error, output) => {
        if (error && error.statusCode === 500) {
          logger.debug(
            { err: error, projectId },
            'error running container so destroying and retrying'
          )
          DockerRunner.destroyContainer(name, null, true, error => {
            if (error != null) {
              return callback(error)
            }
            DockerRunner._runAndWaitForContainer(
              options,
              volumes,
              timeout,
              callback
            )
          })
        } else {
          callback(error, output)
        }
      }
    )

    // pass back the container name to allow it to be killed
    return name
  },

  // Stops a compile, keeping the pages that are already typeset when the
  // container is one we are waiting for (see GracefulStop.js).
  kill(containerId, callback) {
    if (runningContainers.has(containerId)) {
      DockerRunner._stop(containerId).then(() => callback(), callback)
      return
    }
    DockerRunner._kill(containerId, callback)
  },

  _kill(containerId, callback) {
    logger.debug({ containerId }, 'sending kill signal to container')
    const container = dockerode.getContainer(containerId)
    container.kill(error => {
      if (
        error != null &&
        error.message != null &&
        error.message.match(/Cannot kill container .* is not running/)
      ) {
        logger.warn(
          { err: error, containerId },
          'container not running, continuing'
        )
        error = null
      }
      if (error != null) {
        logger.error({ err: error, containerId }, 'error killing container')
        callback(error)
      } else {
        callback()
      }
    })
  },

  _runAndWaitForContainer(options, volumes, timeout, _callback) {
    const callback = _.once(_callback)
    const { name } = options

    let streamEnded = false
    let containerReturned = false
    let output = {}

    function callbackIfFinished() {
      if (streamEnded && containerReturned) {
        callback(null, output)
      }
    }

    function attachStreamHandler(error, _output) {
      if (error != null) {
        return callback(error)
      }
      output = _output
      streamEnded = true
      callbackIfFinished()
    }

    DockerRunner.startContainer(
      options,
      volumes,
      attachStreamHandler,
      (error, containerId) => {
        if (error != null) {
          return callback(error)
        }

        DockerRunner.waitForContainer(
          name,
          timeout,
          options,
          (error, exitCode, { stoppedCleanly = false } = {}) => {
            if (error != null) {
              return callback(error)
            }
            if (exitCode === 137) {
              // exit status from kill -9
              const err = new Error('terminated')
              err.terminated = true
              err.stoppedCleanly = stoppedCleanly
              return callback(err)
            }
            if (exitCode === 1) {
              // exit status from chktex
              const err = new Error('exited')
              err.code = exitCode
              return callback(err)
            }
            output.exitCode = exitCode
            containerReturned = true
            logger.debug(
              // The seccomp policy is very large. Avoid logging it. _.omit deep clones.
              { exitCode, options: _.omit(options, 'HostConfig.SecurityOpt') },
              'docker container has exited'
            )
            callbackIfFinished()
          }
        )
      }
    )
  },

  _getContainerOptions(
    command,
    image,
    volumes,
    timeout,
    environment,
    compileGroup,
    cwd
  ) {
    const timeoutInSeconds = timeout / 1000
    const gracePeriodSeconds = Math.ceil(gracePeriodMs() / 1000)

    for (const hostVol in volumes) {
      const dockerVol = volumes[hostVol]
      if (volumes[hostVol].slice(-3).indexOf(':r') === -1) {
        volumes[hostVol] = `${dockerVol}:rw`
      }
    }

    // merge settings and environment parameter
    const env = {}
    for (const src of [Settings.clsi.docker.env, environment || {}]) {
      for (const key in src) {
        const value = src[key]
        env[key] = value
      }
    }
    // set the path based on the image year
    const match = image.match(/:([0-9]+)\.[0-9]+|:TL([0-9]+)/)
    // the rolling build does not follow our <year>.<version>.<patch> convention
    const year = match ? match[1] || match[2] : 'rolling'

    env.PATH = `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/texlive/${year}/bin/x86_64-linux/`
    const options = {
      Cmd: command,
      Image: image,
      WorkingDir: cwd
        ? Path.posix.join('/compile', cwd)
        : '/compile',
      NetworkDisabled: true,
      Memory: 1024 * 1024 * 1024 * 1024, // 1 Gb
      User: Settings.clsi.docker.user,
      Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
      HostConfig: {
        Binds: Object.entries(volumes).map(
          ([hostVol, dockerVol]) => `${hostVol}:${dockerVol}`
        ),
        LogConfig: { Type: 'none', Config: {} },
        // CPU seconds per process. The margin covers the grace period in
        // which a stopped engine finishes its PDF (SIGXCPU would kill it).
        Ulimits: [
          {
            Name: 'cpu',
            Soft: timeoutInSeconds + gracePeriodSeconds + 5,
            Hard: timeoutInSeconds + gracePeriodSeconds + 10,
          },
        ],
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
      },
    }

    if (Settings.clsi.docker.seccomp_profile != null) {
      options.HostConfig.SecurityOpt.push(
        `seccomp=${Settings.clsi.docker.seccomp_profile}`
      )
    }

    if (Settings.clsi.docker.apparmor_profile != null) {
      options.HostConfig.SecurityOpt.push(
        `apparmor=${Settings.clsi.docker.apparmor_profile}`
      )
    }

    if (Settings.clsi.docker.runtime) {
      options.HostConfig.Runtime = Settings.clsi.docker.runtime
    }

    if (Settings.clsi.docker.Readonly) {
      options.HostConfig.ReadonlyRootfs = true
      options.HostConfig.Tmpfs = { '/tmp': 'rw,noexec,nosuid,size=65536k' }
      options.Volumes['/home/tex'] = {}
    }

    // Allow per-compile group overriding of individual settings
    if (
      Settings.clsi.docker.compileGroupConfig &&
      Settings.clsi.docker.compileGroupConfig[compileGroup]
    ) {
      const override = Settings.clsi.docker.compileGroupConfig[compileGroup]
      for (const key in override) {
        _.set(options, key, override[key])
      }
    }

    return options
  },

  _fingerprintContainer(containerOptions) {
    // Yay, Hashing!
    const json = JSON.stringify(containerOptions)
    return crypto.createHash('md5').update(json).digest('hex')
  },

  startContainer(options, volumes, attachStreamHandler, callback) {
    LockManager.runWithLock(
      options.name,
      releaseLock =>
        DockerRunner._startContainer(
          options,
          volumes,
          attachStreamHandler,
          releaseLock
        ),
      callback
    )
  },

  // Check that volumes exist and are directories
  _startContainer(options, volumes, attachStreamHandler, callback) {
    callback = _.once(callback)
    const { name } = options

    logger.debug({ containerName: name }, 'starting container')
    const container = dockerode.getContainer(name)

    function createAndStartContainer() {
      dockerode.createContainer(options, (error, container) => {
        if (error != null) {
          return callback(error)
        }
        startExistingContainer()
      })
    }

    function startExistingContainer() {
      DockerRunner.attachToContainer(
        options.name,
        attachStreamHandler,
        error => {
          if (error != null) {
            return callback(error)
          }
          container.start(error => {
            if (error != null && error.statusCode !== 304) {
              callback(error)
            } else {
              // already running
              callback()
            }
          })
        }
      )
    }

    container.inspect((error, stats) => {
      if (error != null && error.statusCode === 404) {
        createAndStartContainer()
      } else if (error != null) {
        logger.err(
          { containerName: name, error },
          'unable to inspect container to start'
        )
        callback(error)
      } else {
        startExistingContainer()
      }
    })
  },

  attachToContainer(containerId, attachStreamHandler, attachStartCallback) {
    const container = dockerode.getContainer(containerId)
    container.attach({ stdout: 1, stderr: 1, stream: 1 }, (error, stream) => {
      if (error != null) {
        logger.error(
          { err: error, containerId },
          'error attaching to container'
        )
        return attachStartCallback(error)
      } else {
        attachStartCallback()
      }

      logger.debug({ containerId }, 'attached to container')

      const MAX_OUTPUT = 1024 * 1024 * 2 // limit output to 2MB
      function createStringOutputStream(name) {
        return {
          data: '',
          overflowed: false,
          write(data) {
            if (this.overflowed) {
              return
            }
            if (this.data.length < MAX_OUTPUT) {
              this.data += data
            } else {
              logger.info(
                {
                  containerId,
                  length: this.data.length,
                  maxLen: MAX_OUTPUT,
                },
                `${name} exceeds max size`
              )
              this.data += `(...truncated at ${MAX_OUTPUT} chars...)`
              this.overflowed = true
            }
          },
          // kill container if too much output
          // docker.containers.kill(containerId, () ->)
        }
      }

      const stdout = createStringOutputStream('stdout')
      const stderr = createStringOutputStream('stderr')

      container.modem.demuxStream(stream, stdout, stderr)

      stream.on('error', err =>
        logger.error(
          { err, containerId },
          'error reading from container stream'
        )
      )

      stream.on('end', () =>
        attachStreamHandler(null, { stdout: stdout.data, stderr: stderr.data })
      )
    })
  },

  // Waits for the container to exit. `timeout` is the time the command may
  // run; time spent paused (see `suspend`) does not count.
  waitForContainer(containerId, timeout, options, _callback) {
    const callback = _.once(_callback)

    const container = dockerode.getContainer(containerId)

    const entry = {
      timedOut: false,
      paused: false,
      stopping: null,
      stoppedCleanly: false,
      remainingMs: timeout,
      runningSince: Date.now(),
      timeoutId: null,
      pausedTimeoutId: null,
    }
    entry.startTimer = () => {
      entry.runningSince = Date.now()
      entry.timeoutId = setTimeout(() => {
        entry.timedOut = true
        logger.debug({ containerId }, 'timeout reached, stopping container')
        DockerRunner._stop(containerId)
      }, entry.remainingMs)
    }
    entry.clearTimers = () => {
      clearTimeout(entry.timeoutId)
      clearTimeout(entry.pausedTimeoutId)
    }
    runningContainers.set(containerId, entry)
    entry.startTimer()

    const finish = (...args) => {
      entry.clearTimers()
      if (runningContainers.get(containerId) === entry) {
        runningContainers.delete(containerId)
      }
      callback(...args)
    }

    logger.debug({ containerId }, 'waiting for docker container')
    container.wait((error, res) => {
      if (error?.statusCode === 404 && options.HostConfig.AutoRemove) {
        logger.debug(
          { containerId },
          'auto-destroy container destroyed before starting to wait'
        )
        return finish(null, 0)
      }
      if (error != null) {
        logger.warn({ err: error, containerId }, 'error waiting for container')
        return finish(error)
      }
      if (entry.timedOut) {
        logger.debug({ containerId }, 'docker container timed out')
        error = new Error('container timed out')
        error.timedout = true
        error.stoppedCleanly = entry.stoppedCleanly
        finish(error)
      } else {
        logger.debug(
          { containerId, exitCode: res.StatusCode },
          'docker container returned'
        )
        finish(null, res.StatusCode, { stoppedCleanly: entry.stoppedCleanly })
      }
    })
  },

  // Stops a container we are waiting for: the TeX engines finish the PDF with
  // the pages typeset so far (GracefulStop.js), then the container is killed.
  // Records in the entry whether the files in the compile directory are
  // complete. Repeated calls share the first stop.
  _stop(containerId) {
    const entry = runningContainers.get(containerId)
    if (!entry) {
      return dockerCall(DockerRunner, '_kill', containerId)
    }
    if (!entry.stopping) {
      entry.stopping = (async () => {
        entry.clearTimers()
        const container = dockerode.getContainer(containerId)
        try {
          if (entry.paused) {
            // a paused container can neither run a command nor be killed
            await dockerCall(container, 'unpause')
            entry.paused = false
          }
          entry.stoppedCleanly =
            await DockerRunner._interruptCompile(container)
        } catch (err) {
          logger.warn({ err, containerId }, 'graceful stop failed')
          entry.stoppedCleanly = false
        }
        await dockerCall(DockerRunner, '_kill', containerId).catch(err => {
          logger.warn({ err, containerId }, 'failed to kill container')
        })
      })()
    }
    return entry.stopping
  },

  // Runs the stop script in the container. Resolves with whether everything
  // in it finished cleanly.
  async _interruptCompile(container) {
    const graceMs = gracePeriodMs()
    const exec = await dockerCall(container, 'exec', {
      Cmd: ['sh', '-c', GracefulStop.STOP_SCRIPT],
      Env: [`STOP_ROUNDS=${GracefulStop.stopRounds(graceMs)}`],
      AttachStdout: true,
      AttachStderr: true,
    })
    const stream = await dockerCall(exec, 'start', {})
    let timeoutId
    const ended = await Promise.race([
      new Promise(resolve => {
        stream.on('end', () => resolve(true))
        stream.on('error', () => resolve(true))
        stream.resume()
      }),
      // the xdv/dvi conversion after the grace period gets as long again
      new Promise(resolve => {
        timeoutId = setTimeout(() => resolve(false), graceMs * 2 + 5000)
      }),
    ])
    clearTimeout(timeoutId)
    if (!ended) {
      return false
    }
    const { ExitCode } = await dockerCall(exec, 'inspect')
    return ExitCode === GracefulStop.STOPPED_CLEANLY
  },

  // Pauses a running compile. Its processes are frozen and its time budget
  // stops counting until it is resumed.
  suspend(containerId, callback) {
    const entry = runningContainers.get(containerId)
    if (!entry || entry.stopping) {
      return callback(new Errors.NotFoundError('no running compile'))
    }
    if (entry.paused) {
      return callback()
    }
    const container = dockerode.getContainer(containerId)
    container.pause(error => {
      if (error) {
        return callback(error)
      }
      clearTimeout(entry.timeoutId)
      entry.remainingMs = Math.max(
        0,
        entry.remainingMs - (Date.now() - entry.runningSince)
      )
      entry.paused = true
      entry.pausedTimeoutId = setTimeout(() => {
        logger.warn({ containerId }, 'compile paused for too long, stopping')
        entry.timedOut = true
        DockerRunner._stop(containerId)
      }, maxPausedMs())
      logger.debug(
        { containerId, remainingMs: entry.remainingMs },
        'paused compile'
      )
      callback()
    })
  },

  resume(containerId, callback) {
    const entry = runningContainers.get(containerId)
    if (!entry || entry.stopping) {
      return callback(new Errors.NotFoundError('no running compile'))
    }
    if (!entry.paused) {
      return callback()
    }
    const container = dockerode.getContainer(containerId)
    container.unpause(error => {
      if (error) {
        return callback(error)
      }
      clearTimeout(entry.pausedTimeoutId)
      entry.paused = false
      entry.startTimer()
      logger.debug({ containerId }, 'resumed compile')
      callback()
    })
  },

  // After a restart nobody will resume compiles that were paused, so stop them.
  killPausedContainers(callback) {
    dockerode.listContainers(
      { filters: { status: ['paused'] } },
      (error, containers) => {
        if (error) {
          return callback(error)
        }
        const jobs = (containers || [])
          .filter(container =>
            (container.Names || []).some(name => name.startsWith('/project-'))
          )
          .map(({ Id }) => cb => {
            const container = dockerode.getContainer(Id)
            container.unpause(() => container.kill(() => cb()))
          })
        async.series(jobs, callback)
      }
    )
  },

  destroyContainer(containerName, containerId, shouldForce, callback) {
    // We want the containerName for the lock and, ideally, the
    // containerId to delete.  There is a bug in the docker.io module
    // where if you delete by name and there is an error, it throws an
    // async exception, but if you delete by id it just does a normal
    // error callback. We fall back to deleting by name if no id is
    // supplied.
    LockManager.runWithLock(
      containerName,
      releaseLock =>
        DockerRunner._destroyContainer(
          containerId || containerName,
          shouldForce,
          releaseLock
        ),
      callback
    )
  },

  _destroyContainer(containerId, shouldForce, callback) {
    logger.debug({ containerId }, 'destroying docker container')
    const container = dockerode.getContainer(containerId)
    container.remove({ force: shouldForce === true, v: true }, error => {
      if (error != null && error.statusCode === 404) {
        logger.warn(
          { err: error, containerId },
          'container not found, continuing'
        )
        error = null
      }
      if (error != null) {
        logger.error({ err: error, containerId }, 'error destroying container')
      } else {
        logger.debug({ containerId }, 'destroyed container')
      }
      callback(error)
    })
  },

  // handle expiry of docker containers

  MAX_CONTAINER_AGE: Settings.clsi.docker.maxContainerAge || ONE_HOUR_IN_MS,

  examineOldContainer(container, callback) {
    const name = container.Name || (container.Names && container.Names[0])
    const created = container.Created * 1000 // creation time is returned in seconds
    const now = Date.now()
    const age = now - created
    const maxAge = DockerRunner.MAX_CONTAINER_AGE
    const ttl = maxAge - age
    logger.debug(
      { containerName: name, created, now, age, maxAge, ttl },
      'checking whether to destroy container'
    )
    return { name, id: container.Id, ttl }
  },

  destroyOldContainers(callback) {
    dockerode.listContainers({ all: true }, (error, containers) => {
      if (error != null) {
        return callback(error)
      }
      const jobs = []
      for (const container of containers) {
        const { name, id, ttl } = DockerRunner.examineOldContainer(container)
        if (name.slice(0, 9) === '/project-' && ttl <= 0) {
          // extract projectId: /project-<projectId>-...
          const match = name.match(/^\/project-([a-f0-9]{24})-/)
          const projectId = match && match[1]

          if (projectId != null) {
            const lastAccess = getLastProjectAccessTime(projectId)
            // if last access time is missing, lastAccess === 0, container will be destroyed
            // provided that MAX_CONTAINER_AGE is less that 56 years, but anyway, let's check it
            if (lastAccess && lastAccess > Date.now() - DockerRunner.MAX_CONTAINER_AGE) {
              continue
            }
          }

          // strip the / prefix
          // the LockManager uses the plain container name
          const plainName = name.slice(1)
          jobs.push(cb =>
            DockerRunner.destroyContainer(plainName, id, false, () => cb())
          )
        }
      }
      // Ignore errors because some containers get stuck but
      // will be destroyed next time
      async.series(jobs, callback)
    })
  },

  startContainerMonitor() {
    logger.debug(
      { maxAge: DockerRunner.MAX_CONTAINER_AGE },
      'starting container expiry'
    )

    // guarantee only one monitor is running
    DockerRunner.stopContainerMonitor()

    pausedContainerSweepTimeout = setTimeout(() => {
      DockerRunner.killPausedContainers(err => {
        if (err) {
          logger.error({ err }, 'failed to stop paused containers')
        }
      })
    }, 10 * 1000)

    // randomise the start time
    const randomDelay = Math.floor(Math.random() * 5 * 60 * 1000)
    containerMonitorTimeout = setTimeout(() => {
      containerMonitorInterval = setInterval(
        () =>
          DockerRunner.destroyOldContainers(err => {
            if (err) {
              logger.error({ err }, 'failed to destroy old containers')
            }
          }),
        ONE_HOUR_IN_MS
      )
    }, randomDelay)
  },

  stopContainerMonitor() {
    if (pausedContainerSweepTimeout) {
      clearTimeout(pausedContainerSweepTimeout)
      pausedContainerSweepTimeout = undefined
    }
    if (containerMonitorTimeout) {
      clearTimeout(containerMonitorTimeout)
      containerMonitorTimeout = undefined
    }
    if (containerMonitorInterval) {
      clearInterval(containerMonitorInterval)
      containerMonitorInterval = undefined
    }
  },

  canRunSyncTeXInOutputDir() {
    return Boolean(Settings.path.sandboxedCompilesHostDirOutput)
  },
}

DockerRunner.startContainerMonitor()

DockerRunner.promises = {
  run: promisify(DockerRunner.run),
  kill: promisify(DockerRunner.kill),
  suspend: promisify(DockerRunner.suspend),
  resume: promisify(DockerRunner.resume),
}
export default DockerRunner
