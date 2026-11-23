import { afterAll, describe, expect, it, vi } from 'vitest'
import RedisWrapper from '@overleaf/redis-wrapper'

const socket = process.env.AI_TEST_REDIS_SOCKET
describe.skipIf(!socket)(
  'read-only editor measurements against isolated Redis',
  () => {
    let redis
    afterAll(async () => {
      if (redis) await redis.quit()
    })
    it('excludes expired holders and abandoned waiting heartbeats without changing queue keys', async () => {
      if (!socket.startsWith('/tmp/latex-redis/'))
        throw new Error('An isolated test socket is required')
      redis = RedisWrapper.createClient({ path: socket })
      const now = Date.now()
      vi.doMock('@overleaf/settings', () => ({
        default: { editorPlaces: { limit: 50, maxLimit: 50 } },
      }))
      vi.doMock(
        '../../../../../app/src/infrastructure/RedisWrapper.mjs',
        () => ({ default: { client: () => redis } })
      )
      const places = (
        await import('../../../../editor-waiting-room/app/src/EditorPlaces.mjs')
      ).default
      const [holders, waiting, heartbeat] = places.KEYS
      await redis.del(holders, waiting, heartbeat)
      await redis.zadd(
        holders,
        now + 60000,
        'active-fixture',
        now - 1000,
        'expired-fixture'
      )
      await redis.zadd(
        waiting,
        now - 300000,
        'abandoned-fixture',
        now - 1000,
        'waiting-fixture'
      )
      await redis.zadd(
        heartbeat,
        now - 300000,
        'abandoned-fixture',
        now - 1000,
        'waiting-fixture'
      )
      const before = await Promise.all(
        places.KEYS.map(key => redis.zrange(key, 0, -1, 'WITHSCORES'))
      )
      expect(await places.stats()).toMatchObject({
        holding: 1,
        waiting: 1,
        limit: 50,
      })
      const after = await Promise.all(
        places.KEYS.map(key => redis.zrange(key, 0, -1, 'WITHSCORES'))
      )
      expect(after).toEqual(before)
      await redis.del(holders, waiting, heartbeat)
    })
  }
)
