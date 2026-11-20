import type { Register } from 'claude-code'
import { register as registerAgentModels } from './agent-models'
import { register as registerContextUsage } from './context-usage'
import { register as registerReportGuard } from './report-guard'

// the engine loads one hooks module per plugin, so this entry registers all of them
export const register: Register = (on, options) => {
  registerAgentModels(on, options)
  registerContextUsage(on, options)
  registerReportGuard(on, options)
}
