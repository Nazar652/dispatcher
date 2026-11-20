import type { Register } from 'claude-code'
import { register as registerAgentModels } from './agent-models'
import { register as registerContextUsage } from './context-usage'

// the engine loads one hooks module per plugin, so this entry registers both
export const register: Register = (on, options) => {
  registerAgentModels(on, options)
  registerContextUsage(on, options)
}
