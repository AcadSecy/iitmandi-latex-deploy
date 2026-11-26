import assert from "node:assert/strict";
import { test } from "node:test";
import {
  campusLDAPIdentity,
  campusLDAPOptions,
  mayUseLDAPAccount,
} from "../../services/web/modules/authentication/ldap/app/src/CampusLDAPOptions.mjs";

const config = {
  OVERLEAF_CAMPUS_LDAP_SEARCH_BASE: "dc=example,dc=test",
  OVERLEAF_CAMPUS_LDAP_SEARCH_FILTER: "(uid={{username}})",
};
const id = "6c645def-2bcd-4cd8-a480-009ca11b332a";
const profile = { mail: " Student@Students.IITMandi.ac.in ", entryUUID: id };

test("campus LDAP is optional and requires certificate-verified TLS", () => {
  assert.equal(campusLDAPOptions({}), null);
  const ldaps = campusLDAPOptions({
    ...config,
    OVERLEAF_CAMPUS_LDAP_URL: "ldaps://directory.example.test:636",
  });
  assert.equal(ldaps.tlsOptions.rejectUnauthorized, true);
  assert.equal(ldaps.tlsOptions.servername, "directory.example.test");
  const startTLS = campusLDAPOptions({
    ...config,
    OVERLEAF_CAMPUS_LDAP_URL: "ldap://directory.example.test:389",
    OVERLEAF_CAMPUS_LDAP_STARTTLS: "true",
  });
  assert.equal(startTLS.starttls, true);
  for (const url of [
    "ldap://directory.example.test:389",
    "https://directory.example.test",
    "ldaps://user:password@directory.example.test:636",
  ]) {
    assert.throws(() =>
      campusLDAPOptions({ ...config, OVERLEAF_CAMPUS_LDAP_URL: url }),
    );
  }
  assert.throws(() =>
    campusLDAPOptions({ OVERLEAF_CAMPUS_LDAP_URL: ldaps.url }),
  );
});

test("requires a stable directory ID and an institute email", () => {
  assert.deepEqual(campusLDAPIdentity(profile), {
    email: "student@students.iitmandi.ac.in",
    id,
  });
  assert.equal(campusLDAPIdentity({ ...profile, entryUUID: "student" }), null);
  assert.equal(
    campusLDAPIdentity({ ...profile, mail: "student@example.test" }),
    null,
  );
  assert.equal(
    campusLDAPIdentity({ ...profile, mail: ["student@iitmandi.ac.in"] }),
    null,
  );
});

test("existing and campus accounts do not share credentials", () => {
  const identity = campusLDAPIdentity(profile);
  const existing = { email: identity.email };
  const campusUser = { ...existing, campusLdapId: id };

  assert.equal(mayUseLDAPAccount(existing, null), true);
  assert.equal(mayUseLDAPAccount(existing, identity), false);
  assert.equal(mayUseLDAPAccount(campusUser, null), false);
  assert.equal(
    mayUseLDAPAccount(campusUser, { ...identity, id: "different" }),
    false,
  );
  assert.equal(mayUseLDAPAccount(campusUser, identity), true);
});
