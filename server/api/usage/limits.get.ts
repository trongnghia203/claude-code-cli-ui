import { getUsageLimits } from '../../utils/usageLimits'

export default defineEventHandler(async (event) => {
  try {
    return await getUsageLimits(getQuery(event).refresh === '1')
  } catch (e: any) {
    throw createError({ statusCode: 500, message: e?.message || 'Failed to run claude /usage' })
  }
})
