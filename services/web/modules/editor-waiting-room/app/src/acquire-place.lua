-- Gives a user one of a limited number of editor places, or a place in a
-- first-come-first-served queue for one. Runs atomically in Redis.
--
-- KEYS[1]  sorted set of users holding a place, scored by when it lapses (ms)
-- KEYS[2]  sorted set of users waiting, scored by when they joined (ms)
-- KEYS[3]  sorted set of users waiting, scored by when they last asked (ms)
-- ARGV[1]  user id
-- ARGV[2]  current time (ms)
-- ARGV[3]  how long a place is held without renewal (ms)
-- ARGV[4]  number of places
-- ARGV[5]  how long a waiting user may go without asking before losing
--          their turn (ms)
--
-- Returns {1, 0} when the user holds a place (now renewed), otherwise
-- {0, position in the queue}.

local holders, waiting, lastAsked = KEYS[1], KEYS[2], KEYS[3]
local user = ARGV[1]
local now = tonumber(ARGV[2])
local holdFor = tonumber(ARGV[3])
local places = tonumber(ARGV[4])
local giveUpAfter = tonumber(ARGV[5])

-- Free the places of users who stopped renewing them, and drop waiting users
-- who stopped asking (closed the tab).
redis.call('ZREMRANGEBYSCORE', holders, '-inf', now)
for _, gone in ipairs(redis.call('ZRANGEBYSCORE', lastAsked, '-inf', now - giveUpAfter)) do
  redis.call('ZREM', waiting, gone)
  redis.call('ZREM', lastAsked, gone)
end

local function admit()
  redis.call('ZREM', waiting, user)
  redis.call('ZREM', lastAsked, user)
  redis.call('ZADD', holders, now + holdFor, user)
  return { 1, 0 }
end

if redis.call('ZSCORE', holders, user) then
  return admit()
end

local free = places - redis.call('ZCARD', holders)

if not redis.call('ZSCORE', waiting, user) then
  -- A newcomer only skips the queue when nobody is waiting.
  if free > 0 and redis.call('ZCARD', waiting) == 0 then
    return admit()
  end
  redis.call('ZADD', waiting, now, user)
end
redis.call('ZADD', lastAsked, now, user)

-- Free places go to the users who have waited longest.
local rank = redis.call('ZRANK', waiting, user)
if rank < free then
  return admit()
end
return { 0, rank + 1 }
