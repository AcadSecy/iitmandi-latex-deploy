import { boolFromEnv, readFilesContentFromEnv } from "../../../utils.mjs";

export function campusLDAPOptions(env) {
  if (!env.OVERLEAF_CAMPUS_LDAP_URL) return null;

  const url = new URL(env.OVERLEAF_CAMPUS_LDAP_URL);
  const starttls = boolFromEnv(env.OVERLEAF_CAMPUS_LDAP_STARTTLS) ?? false;
  if (
    (url.protocol !== "ldaps:" && !(url.protocol === "ldap:" && starttls)) ||
    (url.protocol === "ldaps:" && starttls) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== "/")
  ) {
    throw new Error("Campus LDAP requires LDAPS or LDAP with StartTLS");
  }
  if (
    !env.OVERLEAF_CAMPUS_LDAP_SEARCH_BASE ||
    !env.OVERLEAF_CAMPUS_LDAP_SEARCH_FILTER?.includes("{{username}}")
  ) {
    throw new Error("Campus LDAP requires a search base and username filter");
  }

  return {
    url: url.href,
    starttls,
    bindDN: env.OVERLEAF_CAMPUS_LDAP_BIND_DN || "",
    bindCredentials: env.OVERLEAF_CAMPUS_LDAP_BIND_CREDENTIALS || "",
    searchBase: env.OVERLEAF_CAMPUS_LDAP_SEARCH_BASE,
    searchFilter: env.OVERLEAF_CAMPUS_LDAP_SEARCH_FILTER,
    searchScope: "sub",
    searchAttributes: ["mail", "givenName", "sn", "entryUUID"],
    timeout: 5000,
    connectTimeout: 5000,
    tlsOptions: {
      ca: readFilesContentFromEnv(env.OVERLEAF_CAMPUS_LDAP_CA_PATH),
      rejectUnauthorized: true,
      servername: url.hostname,
    },
  };
}

export function campusLDAPIdentity(profile) {
  const email =
    typeof profile.mail === "string" ? profile.mail.trim().toLowerCase() : "";
  const id = typeof profile.entryUUID === "string" ? profile.entryUUID : "";
  if (
    !/^[^@\s]+@(?:students\.)?iitmandi\.ac\.in$/.test(email) ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)
  ) {
    return null;
  }
  return { email, id: id.toLowerCase() };
}

export function mayUseLDAPAccount(user, campusIdentity) {
  return campusIdentity
    ? user.campusLdapId === campusIdentity.id
    : user.campusLdapId == null;
}
