// Lists accounts that nobody has used for a long time, such as those of
// people who have left the Institute, and can delete them with their
// projects. Nothing is deleted unless --delete is given.
//
//   node modules/retention/scripts/inactive-accounts.mjs --days=730
//   ... --days=730 --delete [--skip-email]
//
// Deleted accounts and projects can still be restored by an admin until the
// deleted-account retention period (OVERLEAF_USER_HARD_DELETION_DELAY) ends.

import minimist from 'minimist'
import { db } from '../../../app/src/infrastructure/mongodb.mjs'
import UserDeleter from '../../../app/src/Features/User/UserDeleter.mjs'

const DAY_MS = 24 * 60 * 60 * 1000

function usage() {
  console.error(
    `Usage: node ${import.meta.filename} --days=730 [--delete [--skip-email]]`
  )
  process.exit(101)
}

function lastSeen(user) {
  const dates = [user.lastActive, user.lastLoggedIn, user.signUpDate].filter(
    Boolean
  )
  return dates.length ? new Date(Math.max(...dates)) : null
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ['days'],
    boolean: ['delete', 'skip-email'],
  })
  const days = Number(argv.days)
  if (!(Number.isInteger(days) && days >= 180)) {
    console.error('--days must be a whole number of at least 180')
    usage()
  }
  const cutoff = new Date(Date.now() - days * DAY_MS)
  const notSince = field => ({
    $or: [{ [field]: { $lt: cutoff } }, { [field]: { $exists: false } }],
  })

  const users = await db.users
    .find(
      {
        isAdmin: { $ne: true },
        $and: [
          notSince('lastActive'),
          notSince('lastLoggedIn'),
          notSince('signUpDate'),
        ],
      },
      {
        projection: {
          email: 1,
          lastActive: 1,
          lastLoggedIn: 1,
          signUpDate: 1,
        },
      }
    )
    .toArray()

  console.log(`${users.length} accounts not used for ${days} days:`)
  for (const user of users) {
    const projects = await db.projects.countDocuments({ owner_ref: user._id })
    const seen = lastSeen(user)
    console.log(
      `${user.email}\tlast seen ${seen ? seen.toISOString().slice(0, 10) : 'never'}\t${projects} projects`
    )
  }

  if (!argv.delete) {
    console.log('Nothing was deleted. Add --delete to delete these accounts.')
    return
  }
  for (const user of users) {
    await UserDeleter.promises.deleteUser(user._id, {
      ipAddress: '0.0.0.0',
      force: true,
      skipEmail: argv['skip-email'],
    })
    console.log(`deleted ${user.email}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
