import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import redis from '@overleaf/redis-wrapper'

// Runs the place-keeping script against a real Redis. CI provides one and
// sets TEST_REDIS_HOST; elsewhere these tests are skipped.
const host = process.env.TEST_REDIS_HOST
const KEYS = ['test:places:holders', 'test:places:waiting', 'test:places:asked']
const HOLD = 150_000
const GIVE_UP = 180_000

describe.skipIf(!host)('acquire-place.lua', function () {
  let client

  beforeAll(function () {
    client = redis.createClient({ host, port: 6379 })
    client.defineCommand('acquirePlace', {
      numberOfKeys: KEYS.length,
      lua: fs.readFileSync(
        new URL('../../../app/src/acquire-place.lua', import.meta.url),
        'utf8'
      ),
    })
  })

  afterAll(async function () {
    await client.disconnect()
  })

  beforeEach(async function () {
    await client.del(...KEYS)
  })

  async function ask(user, now, places = 2) {
    const [admitted, position] = await client.acquirePlace(
      ...KEYS,
      user,
      now,
      HOLD,
      places,
      GIVE_UP
    )
    return admitted === 1 ? 'in' : `#${position}`
  }

  it('gives out places, then queues people in order', async function () {
    expect(await ask('u1', 0)).to.equal('in')
    expect(await ask('u2', 0)).to.equal('in')
    expect(await ask('u3', 1)).to.equal('#1')
    expect(await ask('u4', 2)).to.equal('#2')
    expect(await ask('u1', 60_000)).to.equal('in')
    expect(await ask('u3', 60_000)).to.equal('#1')
  })

  it('gives a lapsed place to whoever waited longest', async function () {
    await ask('u1', 0)
    await ask('u2', 0)
    await ask('u3', 1)
    await ask('u4', 2)
    await ask('u1', 100_000)
    // u2 stopped renewing and lapses at 150 s
    expect(await ask('u4', 150_001)).to.equal('#2')
    expect(await ask('u3', 150_002)).to.equal('in')
    expect(await ask('u4', 150_003)).to.equal('#1')
  })

  it('drops people from the queue when they stop asking', async function () {
    await ask('u1', 0)
    await ask('u2', 0)
    await ask('u3', 1)
    await ask('u4', 2)
    let now = 2
    while (now < GIVE_UP + 60_000) {
      now += 50_000
      await ask('u1', now)
      await ask('u2', now)
      await ask('u4', now)
    }
    expect(await ask('u4', now)).to.equal('#1')
    expect(await ask('u3', now + 1)).to.equal('#2')
  })

  it('keeps holders when places are reduced and queues newcomers', async function () {
    for (const user of ['a', 'b', 'c']) {
      await ask(user, 0, 3)
    }
    expect(await ask('a', 1, 1)).to.equal('in')
    expect(await ask('d', 2, 1)).to.equal('#1')
  })

  it('does not let a newcomer skip the queue', async function () {
    await ask('u1', 0, 1)
    await ask('u2', 1, 1)
    // u1 lapses; u2 has not asked yet, so the place is free but u2 is waiting
    expect(await ask('u3', HOLD + 1, 1)).to.equal('#2')
    expect(await ask('u2', HOLD + 2, 1)).to.equal('in')
  })
})
