/* eslint-disable
    no-return-assign,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { spawn } from 'node:child_process'
import { promisify } from 'node:util'
import Path from 'node:path'
import _ from 'lodash'
import logger from '@overleaf/logger'
import GracefulStop from './GracefulStop.js'
let CommandRunner

logger.debug('using standard command runner')

// Track PIDs that have been intentionally killed so that the close handler
// can detect termination even when the child exits with a numeric code instead
// of being reported as killed by a signal (e.g. exit code 4 from latexmk).
// The value says whether the stop was graceful (see GracefulStop.js).
const killedPids = new Map()

// Directories of the running commands, by PID.
const runningDirectories = new Map()

export default CommandRunner = {
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
    let key, value
    callback = _.once(callback)
    const spawnCwd = cwd ? Path.join(directory, cwd) : directory
    command = Array.from(command).map(arg =>
      arg.toString().replace('$COMPILE_DIR', directory)
    )
    logger.debug(
      { projectId, command, directory, cwd: spawnCwd },
      'running command'
    )
    logger.warn('timeouts and sandboxing are not enabled with CommandRunner')

    // merge environment settings
    const env = {}
    for (key in process.env) {
      value = process.env[key]
      env[key] = value
    }
    for (key in environment) {
      value = environment[key]
      env[key] = value
    }

    // run command as detached process so it has its own process group (which can be killed if needed)
    const proc = spawn(command[0], command.slice(1), {
      cwd: spawnCwd,
      env,
      stdio: ['pipe', 'pipe', 'ignore'],
      detached: true,
    })

    let stdout = ''
    proc.stdout.setEncoding('utf8').on('data', data => (stdout += data))
    runningDirectories.set(proc.pid, directory)

    proc.on('error', function (err) {
      killedPids.delete(proc.pid)
      runningDirectories.delete(proc.pid)
      logger.err(
        { err, projectId, command, directory },
        'error running command'
      )
      return callback(err)
    })

    proc.on('close', function (code, signal) {
      let err
      logger.debug({ code, signal, projectId }, 'command exited')
      const wasKilled = killedPids.has(proc.pid)
      const stoppedCleanly = killedPids.get(proc.pid) === true
      killedPids.delete(proc.pid)
      runningDirectories.delete(proc.pid)
      if (signal === 'SIGTERM' || wasKilled) {
        err = new Error('terminated')
        err.terminated = true
        err.stoppedCleanly = stoppedCleanly
        return callback(err)
      } else if (code === 1) {
        // exit status from chktex
        err = new Error('exited')
        err.code = code
        return callback(err)
      } else {
        return callback(null, { stdout, exitCode: code })
      }
    })

    return proc.pid
  }, // return process id to allow job to be killed if necessary

  // Stops the command, letting TeX finish the PDF with the pages typeset so
  // far (GracefulStop.js), then kills its process group.
  kill(pid, callback) {
    if (callback == null) {
      callback = function () {}
    }
    if (killedPids.has(pid)) {
      return callback()
    }
    killedPids.set(pid, false)
    try {
      // a paused command has to run to finish its files
      process.kill(-pid, 'SIGCONT')
    } catch (err) {
      killedPids.delete(pid)
      return callback(err)
    }
    const graceMs = GracefulStop.gracePeriodMs()
    const stopper = spawn('sh', ['-c', GracefulStop.STOP_SCRIPT], {
      env: {
        ...process.env,
        STOP_PGID: String(pid),
        STOP_DIR: runningDirectories.get(pid) || '.',
        STOP_ROUNDS: String(GracefulStop.stopRounds(graceMs)),
      },
      stdio: 'ignore',
    })
    const killGroup = _.once(code => {
      clearTimeout(timeoutId)
      if (killedPids.has(pid)) {
        killedPids.set(pid, code === GracefulStop.STOPPED_CLEANLY)
      }
      try {
        process.kill(-pid, 'SIGKILL') // kill all processes in group
      } catch (err) {
        // the command has already exited
      }
      callback()
    })
    const timeoutId = setTimeout(() => {
      stopper.kill('SIGKILL')
      killGroup(null)
    }, graceMs * 2 + 5000)
    stopper.on('error', () => killGroup(null))
    stopper.on('close', code => killGroup(code))
  },

  // Pauses or resumes all processes of a running command.
  suspend(pid, callback) {
    CommandRunner._signalGroup(pid, 'SIGSTOP', callback)
  },

  resume(pid, callback) {
    CommandRunner._signalGroup(pid, 'SIGCONT', callback)
  },

  _signalGroup(pid, signal, callback) {
    if (!runningDirectories.has(pid) || killedPids.has(pid)) {
      const error = new Error('no running command')
      error.name = 'NotFoundError'
      return callback(error)
    }
    try {
      process.kill(-pid, signal)
    } catch (err) {
      return callback(err)
    }
    callback()
  },

  canRunSyncTeXInOutputDir() {
    return true
  },
}

CommandRunner.promises = {
  run: promisify(CommandRunner.run),
  kill: promisify(CommandRunner.kill),
  suspend: promisify(CommandRunner.suspend),
  resume: promisify(CommandRunner.resume),
}
