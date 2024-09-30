import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it } from 'vitest'

import { database } from '../../client'
import { users } from '../../schema'
import { paginateQuery } from './paginate'

const dynamicQuery = database
  .select({ email: users.email })
  .from(users)
  .$dynamic()
const pageUrl = { base: 'http://localhost/my-page' }
describe('paginateQuery', () => {
  beforeEach(async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        factories.createUser({ email: `user_${i + 1}@example.com` }),
      ),
    )
  })

  it('returns first 2 users', async () => {
    const { rows, pagination } = await paginateQuery({
      dynamicQuery,
      pageUrl,
      searchParams: 'page=1&pageSize=2',
    })

    expect(pagination).toEqual({
      count: 8,
      page: 1,
      pageSize: 2,
      totalPages: 4,
      baseUrl: 'http://localhost/my-page',
      nextPage: {
        url: 'http://localhost/my-page?page=2&pageSize=2',
        value: 2,
      },
      prevPage: undefined,
    })
    expect(rows.map((r) => r.email)).toEqual([
      'user_1@example.com',
      'user_2@example.com',
    ])
  })

  it('returns page 3', async () => {
    const { rows, pagination } = await paginateQuery({
      dynamicQuery,
      pageUrl,
      searchParams: {
        page: '3',
        pageSize: '2',
      },
    })

    expect(pagination).toEqual({
      count: 8,
      page: 3,
      pageSize: 2,
      totalPages: 4,
      baseUrl: 'http://localhost/my-page',
      nextPage: {
        url: 'http://localhost/my-page?page=4&pageSize=2',
        value: 4,
      },
      prevPage: {
        url: 'http://localhost/my-page?page=2&pageSize=2',
        value: 2,
      },
    })
    expect(rows.map((r) => r.email)).toEqual([
      'user_5@example.com',
      'user_6@example.com',
    ])
  })

  it('with default page size', async () => {
    const { rows, pagination } = await paginateQuery({
      dynamicQuery,
      pageUrl,
      defaultPaginate: { pageSize: 4 },
    })

    expect(pagination).toEqual({
      count: 8,
      page: 1,
      pageSize: 4,
      totalPages: 2,
      baseUrl: 'http://localhost/my-page',
      nextPage: {
        url: 'http://localhost/my-page?page=2&pageSize=4',
        value: 2,
      },
      prevPage: undefined,
    })
    expect(rows.map((r) => r.email)).toEqual([
      'user_1@example.com',
      'user_2@example.com',
      'user_3@example.com',
      'user_4@example.com',
    ])
  })

  it('respect other search params', async () => {
    const { rows, pagination } = await paginateQuery({
      dynamicQuery,
      pageUrl,
      searchParams: 'page=1&pageSize=2&sort=email',
    })

    expect(pagination).toEqual({
      count: 8,
      page: 1,
      pageSize: 2,
      totalPages: 4,
      baseUrl: 'http://localhost/my-page',
      nextPage: {
        url: 'http://localhost/my-page?page=2&pageSize=2&sort=email',
        value: 2,
      },
      prevPage: undefined,
    })
    expect(rows.map((r) => r.email)).toEqual([
      'user_1@example.com',
      'user_2@example.com',
    ])
  })
})
