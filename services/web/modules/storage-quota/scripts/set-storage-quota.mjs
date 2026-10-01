// Shows a user's storage use and quota, and changes the quota.
//
//   node modules/storage-quota/scripts/set-storage-quota.mjs --email=EMAIL
//   ... --email=EMAIL --mb=2000      set the quota to 2000 MB
//   ... --email=EMAIL --unlimited    no limit for this user
//   ... --email=EMAIL --default      back to the default (STORAGE_QUOTA_MB)

import minimist from 'minimist'
import { db } from '../../../app/src/infrastructure/mongodb.mjs'
import StorageQuota from '../app/src/StorageQuota.mjs'

const MB = 1024 * 1024

function usage() {
  console.error(
    `Usage: node ${import.meta.filename} --email=EMAIL [--mb=2000 | --unlimited | --default]`
  )
  process.exit(101)
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ['email', 'mb'],
    boolean: ['unlimited', 'default'],
  })
  const email = argv.email?.trim().toLowerCase()
  const mb = argv.mb === undefined ? undefined : Number(argv.mb)
  const changes = [mb !== undefined, argv.unlimited, argv.default].filter(
    Boolean
  )
  if (
    !email ||
    changes.length > 1 ||
    (mb !== undefined && !(Number.isInteger(mb) && mb > 0))
  ) {
    usage()
  }

  const user = await db.users.findOne({ email }, { projection: { email: 1 } })
  if (!user) {
    console.error(`No user with the email address ${email}`)
    process.exit(102)
  }

  if (mb !== undefined) {
    await StorageQuota.setQuotaMB(user._id, mb)
  } else if (argv.unlimited) {
    await StorageQuota.setQuotaMB(user._id, 0)
  } else if (argv.default) {
    await StorageQuota.setQuotaMB(user._id, null)
  }

  const { usedBytes, quotaBytes, maxBytes, limitBytes } =
    await StorageQuota.getStatus(user._id, { fresh: true })
  let quota = 'no limit'
  if (quotaBytes != null) {
    quota = `${quotaBytes / MB} MB`
    if (maxBytes > quotaBytes) {
      quota += `, up to ${maxBytes / MB} MB while the disk has room (now ${limitBytes / MB} MB)`
    }
  }
  console.log(
    `${user.email}: ${(usedBytes / MB).toFixed(1)} MB used, quota ${quota}`
  )
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
