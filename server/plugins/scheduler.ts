import { startInProcessScheduler } from '../utils/schedules/scheduler'

export default defineNitroPlugin(() => {
  startInProcessScheduler()
})
