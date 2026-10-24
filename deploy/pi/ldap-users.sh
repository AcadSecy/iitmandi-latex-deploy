#!/bin/bash
# The test platform's own LDAP directory: who may log in, and their passwords.
# People log in with their roll number or LDAP username, as they will with the
# Institute's LDAP; until DCS gives us that server, the platform asks this
# small directory instead (glauth, the "ldap" service in docker-compose.yml).
#
#   bash ldap-users.sh b25255 b24116 ...      (on the Pi, in /srv/iitmandi-latex/compose)
#   bash ldap-users.sh b25255=b25255 ...      the same, with the password given
#
# Gives every user named a new random password, or the one after "=" (printed,
# and kept in ~/.config/iitmandi-latex/ldap-users.txt, readable only by you),
# and makes:
#   ldap.cfg   the directory (password hashes only)
#   ldap.env   the allowlist (OVERLEAF_LDAP_SEARCH_FILTER: only the users named
#              can log in) and the search account's password
# Neither file is in git, so the roll numbers stay out of the public repository.
# Then restart the app: docker compose up -d ldap sharelatex
#
# Run it again with the full list to add or remove someone; everyone named gets
# a new password. EXTRA_USERS are in the directory but not on the allowlist
# (CI uses one to check that they are refused). MAIL_DOMAIN gives the email
# their account is made with (students.iitmandi.ac.in).
#
# Moving to the Institute's LDAP: point OVERLEAF_LDAP_URL, _SEARCH_BASE and
# _BIND_DN in pi.env at it, and put its search account's password in ldap.env.
# The allowlist works the same there.
set -euo pipefail

[ $# -ge 1 ] || { echo "usage: bash ldap-users.sh USER..." >&2; exit 1; }
DIR=$(cd "$(dirname "$0")" && pwd)
MAIL_DOMAIN=${MAIL_DOMAIN:-students.iitmandi.ac.in}
BASE="dc=iitmandi,dc=ac,dc=in"
PASSWORDS=${PASSWORDS_FILE:-$HOME/.config/iitmandi-latex/ldap-users.txt}

rand() { openssl rand -base64 24 | tr -d '/+=' | cut -c1-14; }
sha() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

search_pw=$(rand)
cfg=$(mktemp "$DIR/.ldap.cfg.XXXX")
cat > "$cfg" <<EOF
# Made by ldap-users.sh on $(date -I). The platform's test directory: see that script.
[ldap]
  enabled = true
  listen = "0.0.0.0:3893"
[ldaps]
  enabled = false
[backend]
  datastore = "config"
  baseDN = "$BASE"
  nameformat = "uid"
  groupformat = "ou"
[behaviors]
  IgnoreCapabilities = false
  # Every login reaches the directory from the app's one address, so locking an
  # address out after failed binds would lock everyone out. The app limits
  # login attempts itself.
  LimitFailedBinds = false

[[groups]]
  name = "people"
  gidnumber = 5501
[[groups]]
  name = "svc"
  gidnumber = 5502

# The account the app searches the directory with
[[users]]
  name = "search"
  uidnumber = 5000
  primarygroup = 5502
  passsha256 = "$(sha "$search_pw")"
  [[users.capabilities]]
    action = "search"
    object = "*"
EOF

mkdir -p "$(dirname "$PASSWORDS")"
umask 077
list=$(mktemp)
uid=5001
filter=""
names=()
for arg in "$@" ${EXTRA_USERS:-}; do
  user=${arg%%=*}
  if ! [[ "$user" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
    echo "not a username: $user" >&2
    rm -f "$cfg" "$list"
    exit 1
  fi
  if [[ "$arg" == *=* ]]; then pw=${arg#*=}; else pw=$(rand); fi
  cat >> "$cfg" <<EOF

[[users]]
  name = "$user"
  givenname = "$user"
  sn = ""
  mail = "$user@$MAIL_DOMAIN"
  uidnumber = $uid
  primarygroup = 5501
  passsha256 = "$(sha "$pw")"
EOF
  printf '%s %s\n' "$user" "$pw" >> "$list"
  uid=$((uid + 1))
done
for arg in "$@"; do names+=("${arg%%=*}"); filter="$filter(uid=${arg%%=*})"; done

chmod 644 "$cfg"   # read by the directory's container
mv "$cfg" "$DIR/ldap.cfg"
{
  echo "# Made by ldap-users.sh on $(date -I). Not in git."
  echo "OVERLEAF_LDAP_SEARCH_FILTER=(&(uid={{username}})(|$filter))"
  echo "OVERLEAF_LDAP_BIND_CREDENTIALS=$search_pw"
} > "$DIR/ldap.env"
mv "$list" "$PASSWORDS"

echo "Allowed: ${names[*]}"
echo "Passwords (also in $PASSWORDS):"
cat "$PASSWORDS"
