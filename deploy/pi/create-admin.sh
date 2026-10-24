#!/bin/bash
# Make an admin account on the Pi's test platform, with a password, without
# email (the Pi sends none). Run on the Pi once the platform is up:
#
#   bash create-admin.sh admin@iitmandi-latex.test
#
# Prints the password and keeps a copy in ~/.config/iitmandi-latex/admin.txt
# (readable only by you). PASSWORD=... sets one instead of a random one.
# Other accounts: Admin > Manage Users in the app.
set -euo pipefail

EMAIL=${1:?usage: create-admin.sh EMAIL}
PASSWORD=${PASSWORD:-$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-16)}

docker exec -i -e EMAIL="$EMAIL" -e PASSWORD="$PASSWORD" -w /overleaf/services/web iitmandi-latex \
  node --input-type=module <<'EOF'
import crypto from 'node:crypto'
import UserRegistrationHandler from './app/src/Features/User/UserRegistrationHandler.mjs'
import { db } from './app/src/infrastructure/mongodb.mjs'

const { EMAIL, PASSWORD } = process.env
const handler = UserRegistrationHandler.promises || UserRegistrationHandler
// as registerNewUserAndSendActivationEmail does
const user = await handler.registerNewUser({
  email: EMAIL,
  password: PASSWORD,
  analyticsId: crypto.randomUUID(),
})
await db.users.updateOne({ _id: user._id }, { $set: { isAdmin: true } })
console.log(`${EMAIL} is an admin`)
process.exit(0)
EOF

mkdir -p ~/.config/iitmandi-latex
umask 077
printf '%s\n%s\n' "$EMAIL" "$PASSWORD" > ~/.config/iitmandi-latex/admin.txt
echo "password: $PASSWORD (also in ~/.config/iitmandi-latex/admin.txt)"
