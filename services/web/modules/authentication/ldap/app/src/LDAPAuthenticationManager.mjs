import crypto from 'node:crypto'
import Settings from '@overleaf/settings'
import UserCreator from '../../../../../app/src/Features/User/UserCreator.mjs'
import { ParallelLoginError } from '../../../../../app/src/Features/Authentication/AuthenticationErrors.mjs'
import { User } from '../../../../../app/src/models/User.mjs'
import { splitFullName } from '../../../utils.mjs'
import { campusLDAPIdentity, mayUseLDAPAccount } from './CampusLDAPOptions.mjs'

const LDAPAuthenticationManager = {
  async findOrCreateUser(profile, auditLog, campus = false) {
    //user is already authenticated in LDAP
    const {
      attEmail,
      attFirstName,
      attLastName,
      attName,
      attAdmin,
      valAdmin,
      updateUserDetailsOnLogin,
    } = Settings.ldap

    const campusIdentity = campus ? campusLDAPIdentity(profile) : null
    if (campus && !campusIdentity) return null
    const rawEmail = profile[attEmail]
    const email = campusIdentity?.email ??
      (Array.isArray(rawEmail) ? rawEmail[0] : rawEmail)?.toLowerCase()
    if (!email) return null
    let nameParts = ["",""]
    if ((!attFirstName || !attLastName) && attName) {
      nameParts = splitFullName(profile[attName] || "")
    }
    const firstName = profile[campus ? 'givenName' : attFirstName] || nameParts[0]
    let lastName = profile[campus ? 'sn' : attLastName] || nameParts[1]
    if (!firstName && !lastName) lastName = email
    let isAdmin = false
    if( !campus && attAdmin && valAdmin ) {
      isAdmin = Array.isArray(profile[attAdmin]) ? profile[attAdmin].includes(valAdmin) :
                                                   profile[attAdmin] === valAdmin
    }
    let user = await User.findOne(campus ? { 'emails.email': email } : { email }).exec()
    if (user && !mayUseLDAPAccount(user, campusIdentity)) return null

    if (!user) {
      user = await UserCreator.promises.createNewUser(
        {
          email: email,
          first_name: firstName,
          last_name: lastName,
          isAdmin: isAdmin,
          holdingAccount: false,
          analyticsId: crypto.randomUUID(),
          ...(campusIdentity && { campusLdapId: campusIdentity.id }),
        }
      )
      await User.updateOne(
        { _id: user._id },
        { $set : { 'emails.0.confirmedAt' : Date.now() } }
      ).exec() //email of ldap user is confirmed
    }
    let userDetails = updateUserDetailsOnLogin ? { first_name : firstName, last_name: lastName } : {}
    if( !campus && attAdmin && valAdmin ) {
      user.isAdmin = isAdmin
      userDetails.isAdmin = isAdmin
    }
    const result = await User.updateOne(
      {
        _id: user._id,
        loginEpoch: user.loginEpoch,
        campusLdapId: campusIdentity?.id ?? { $exists: false },
      },
      {
        $inc: { loginEpoch: 1 },
        $set: userDetails,
        $unset: { hashedPassword: "" },
      }
    ).exec()
    if (result.modifiedCount !== 1) {
      throw new ParallelLoginError()
    }
    return user
  },
}

export default {
  promises: LDAPAuthenticationManager,
}
