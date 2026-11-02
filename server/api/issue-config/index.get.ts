import { hasProjectConfig, readConfig, usageCounts } from '../../utils/issues/config'
import { scopeOf } from '../../utils/issues/configValidate'

/** ?projectDir=<path>: the config that project reads (its own file or the default), and whether it has its own. */
export default defineEventHandler((event) => {
  const dir = scopeOf(event)
  return { config: readConfig(dir), usage: usageCounts(dir && hasProjectConfig(dir) ? dir : null), custom: hasProjectConfig(dir) }
})
