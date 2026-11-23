// One Redis hash tag makes all keys part of one cluster slot. Never store text.
export const GUARD_KEY = 'ai-assistance:{budget}:guard'
export const ACTIVE_KEY = 'ai-assistance:{budget}:active'
export const dayKey = day => `ai-assistance:{budget}:day:${day}`

export const RESERVE = `
local epoch, day, user, id = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local now, cost = tonumber(ARGV[5]), tonumber(ARGV[6])
if redis.call('HGET', KEYS[1], 'epoch') ~= epoch then return 'unavailable' end
local previous = redis.call('HGET', KEYS[1], 'day')
if not previous or previous > day then return 'unavailable' end
if previous ~= day then
  if redis.call('EXISTS', 'ai-assistance:{budget}:day:' .. previous) == 0 then return 'unavailable' end
  if redis.call('EXISTS', KEYS[2]) == 1 then return 'unavailable' end
  redis.call('HSET', KEYS[2], 'initialized', epoch)
  redis.call('HSET', KEYS[1], 'day', day)
end
if redis.call('HGET', KEYS[2], 'initialized') ~= epoch then return 'unavailable' end
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)
local active = redis.call('ZRANGE', KEYS[3], 0, -1)
if #active >= 2 then return 'busy' end
for _, member in ipairs(active) do
  if string.sub(member, 1, string.len(user) + 1) == user .. ':' then return 'busy' end
end
local minute = 'minute:' .. user .. ':' .. math.floor(now / 60000)
local userCost, userRequests = 'cost:' .. user, 'requests:' .. user
if tonumber(redis.call('HGET', KEYS[2], minute) or '0') >= 3 then return 'rate' end
if tonumber(redis.call('HGET', KEYS[2], userRequests) or '0') >= 20 then return 'rate' end
if tonumber(redis.call('HGET', KEYS[2], userCost) or '0') + cost > tonumber(ARGV[7]) then return 'budget' end
if tonumber(redis.call('HGET', KEYS[2], 'cost') or '0') + cost > tonumber(ARGV[8]) then return 'budget' end
redis.call('HINCRBY', KEYS[2], minute, 1)
redis.call('HINCRBY', KEYS[2], userRequests, 1)
redis.call('HINCRBY', KEYS[2], userCost, cost)
redis.call('HINCRBY', KEYS[2], 'cost', cost)
redis.call('EXPIRE', KEYS[2], 691200)
redis.call('ZADD', KEYS[3], now + 45000, user .. ':' .. id)
return 'ok'
`

// Initialization is an explicit operator action. A missing ledger never resets
// today's allowance automatically, including after Redis loss or restore.
export const INITIALIZE = `
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'epoch', ARGV[1], 'day', ARGV[2])
redis.call('HSET', KEYS[2], 'initialized', ARGV[1])
redis.call('EXPIRE', KEYS[2], 691200)
return 1
`

export async function reserve(redis, config, userId, requestId, now, cost) {
  const day = new Date(now).toISOString().slice(0, 10)
  return redis.eval(
    RESERVE,
    3,
    GUARD_KEY,
    dayKey(day),
    ACTIVE_KEY,
    config.budgetEpoch,
    day,
    String(userId),
    requestId,
    now,
    cost,
    config.userDailyNanodollars,
    config.globalDailyNanodollars
  )
}
