import Settings from '@overleaf/settings'
import RedisWrapper from '../../../app/src/infrastructure/RedisWrapper.mjs'
import { INITIALIZE, GUARD_KEY, dayKey } from '../app/src/AssistanceBudget.mjs'

const epoch = Settings.askAi?.managed?.budgetEpoch
if (!epoch || process.argv[2] !== '--initialize-new-ledger') {
  throw new Error(
    'Set ASK_AI_BUDGET_EPOCH, then pass --initialize-new-ledger. Never reset a lost ledger without reconciling today’s spending.'
  )
}
const client = RedisWrapper.client('aiAssistance')
try {
  const day = new Date().toISOString().slice(0, 10)
  const created = await client.eval(
    INITIALIZE,
    2,
    GUARD_KEY,
    dayKey(day),
    epoch,
    day
  )
  if (!created)
    throw new Error('A budget ledger already exists; no changes made.')
  process.stdout.write(
    `Initialized assistance budget ledger for ${day} (UTC).\n`
  )
} finally {
  client.disconnect()
}
