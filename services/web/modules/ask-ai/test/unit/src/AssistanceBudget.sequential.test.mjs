import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import RedisWrapper from '@overleaf/redis-wrapper'
import {
  ACTIVE_KEY,
  GUARD_KEY,
  INITIALIZE,
  dayKey,
  reserve,
} from '../../../app/src/AssistanceBudget.mjs'

const socket = process.env.AI_TEST_REDIS_SOCKET
describe.skipIf(!socket)(
  'atomic assistance ledger against isolated Redis',
  () => {
    let redis
    const now = Date.parse('2026-11-16T12:00:00Z')
    const config = {
      budgetEpoch: 'fixture',
      userDailyNanodollars: 1000,
      globalDailyNanodollars: 1000,
    }
    beforeEach(async () => {
      if (!socket.startsWith('/tmp/latex-redis/'))
        throw new Error('Only an isolated test socket is allowed')
      redis ||= RedisWrapper.createClient({ path: socket })
      await redis.del(
        GUARD_KEY,
        ACTIVE_KEY,
        dayKey('2026-11-16'),
        dayKey('2026-11-17')
      )
      await redis.eval(
        INITIALIZE,
        2,
        GUARD_KEY,
        dayKey('2026-11-16'),
        'fixture',
        '2026-11-16'
      )
    })
    afterAll(async () => {
      if (redis) await redis.quit()
    })
    it('reserves per-user and global money atomically under concurrent callers', async () => {
      const limited = { ...config, globalDailyNanodollars: 15 }
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          reserve(redis, limited, `user${i}`, `r${i}`, now, 10)
        )
      )
      expect(results.filter(result => result === 'ok').length).toEqual(1)
      expect(await redis.hget(dayKey('2026-11-16'), 'cost')).toEqual('10')
    })
    it('enforces one in-flight request/user and two globally', async () => {
      expect(await reserve(redis, config, 'a', 'one', now, 1)).toEqual('ok')
      expect(await reserve(redis, config, 'a', 'two', now, 1)).toEqual('busy')
      expect(await reserve(redis, config, 'b', 'one', now, 1)).toEqual('ok')
      expect(await reserve(redis, config, 'c', 'one', now, 1)).toEqual('busy')
    })
    it('keeps costs on release, enforces the rate and advances UTC days safely', async () => {
      for (let i = 0; i < 3; i++) {
        expect(await reserve(redis, config, 'a', `r${i}`, now, 10)).toEqual(
          'ok'
        )
        await redis.zrem(ACTIVE_KEY, `a:r${i}`)
      }
      expect(await reserve(redis, config, 'a', 'four', now, 10)).toEqual('rate')
      expect(await redis.hget(dayKey('2026-11-16'), 'cost')).toEqual('30')
      expect(
        await reserve(redis, config, 'a', 'tomorrow', now + 86400000, 10)
      ).toEqual('ok')
      expect(await redis.hget(dayKey('2026-11-17'), 'cost')).toEqual('10')
    })
    it('fails closed if today’s ledger or initialization guard is lost', async () => {
      await redis.del(dayKey('2026-11-16'))
      expect(await reserve(redis, config, 'a', 'r1', now, 1)).toEqual(
        'unavailable'
      )
      await redis.del(GUARD_KEY)
      expect(await reserve(redis, config, 'a', 'r2', now, 1)).toEqual(
        'unavailable'
      )
    })
    it('does not overwrite an already initialized ledger', async () => {
      await reserve(redis, config, 'a', 'r1', now, 10)
      expect(
        await redis.eval(
          INITIALIZE,
          2,
          GUARD_KEY,
          dayKey('2026-11-16'),
          'new',
          '2026-11-16'
        )
      ).toEqual(0)
      expect(await redis.hget(dayKey('2026-11-16'), 'cost')).toEqual('10')
    })
  }
)
