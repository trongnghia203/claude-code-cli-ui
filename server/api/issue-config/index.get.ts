import { readConfig, usageCounts } from '../../utils/issues/config'

/** The global issue settings, and how many issues use each label and property. */
export default defineEventHandler(() => ({ config: readConfig(), usage: usageCounts() }))
