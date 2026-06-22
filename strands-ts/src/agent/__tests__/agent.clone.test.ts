import { describe, it, expect, vi } from 'vitest'
import { Agent } from '../agent.js'
import { McpClient } from '../../mcp.js'
import { TestModelProvider } from '../../__fixtures__/model-test-helpers.js'
import { createMockTool } from '../../__fixtures__/tool-helpers.js'
import { InitializedEvent } from '../../hooks/index.js'
import type { Plugin } from '../../plugins/plugin.js'
import type { LocalAgent } from '../../types/agent.js'
import { Message } from '../../types/messages.js'

/** A uniquely named plugin that flips `initialized` when it gets installed. */
function makeNamedPlugin(name: string): Plugin & { initialized: boolean } {
  const plugin = {
    name,
    initialized: false,
    initAgent(agent: LocalAgent): void {
      agent.addHook(InitializedEvent, () => {
        plugin.initialized = true
      })
    },
  }
  return plugin
}

/**
 * Build an object that passes `instanceof McpClient` whose `listTools` is a
 * spy. `Agent.initialize()` only calls `listTools()` and assigns
 * `onToolsChanged`, so that minimal surface is all the test needs.
 */
function makeFakeMcpClient(toolName: string): McpClient {
  const tool = createMockTool(toolName, () => 'ok')
  const client = Object.create(McpClient.prototype) as McpClient
  Object.assign(client, { listTools: vi.fn(async () => [tool]) })
  Object.defineProperty(client, 'onToolsChanged', {
    configurable: true,
    set: () => {},
    get: () => undefined,
  })
  return client
}

describe('Agent.clone', () => {
  it('replays the template config to build an independent fresh agent', () => {
    const template = new Agent({
      model: new TestModelProvider(),
      tools: [],
      name: 'tpl',
      description: 'the template',
      id: 'tpl-id',
      systemPrompt: 'be helpful',
      appState: { a: 1 },
      modelState: { m: 2 },
    })

    const clone = template.clone()

    expect(clone).toBeInstanceOf(Agent)
    expect(clone).not.toBe(template)
    expect(clone.name).toBe('tpl')
    expect(clone.description).toBe('the template')
    expect(clone.id).toBe('tpl-id')
    expect(clone.appState.getAll()).toEqual({ a: 1 })
    expect(clone.modelState.getAll()).toEqual({ m: 2 })
    expect(clone.model).toBe(template.model)
  })

  it('does not carry runtime state (messages/appState mutations) into the clone', () => {
    const template = new Agent({ model: new TestModelProvider(), tools: [], appState: { a: 1 } })

    // Mutate the template's runtime state after construction.
    template.messages.push(Message.fromMessageData({ role: 'user', content: [{ text: 'hi' }] }))
    template.appState.set('a', 999)

    const clone = template.clone()

    // Clone reflects the original CONFIG, not the template's live state.
    expect(clone.messages).toHaveLength(0)
    expect(clone.appState.getAll()).toEqual({ a: 1 })
    // Independent stores.
    expect(clone.appState).not.toBe(template.appState)
  })

  it('seeds fresh state via overrides without mutating the template', () => {
    const sm = { name: 'sm' } as never
    const template = new Agent({ model: new TestModelProvider(), tools: [] })

    const clone = template.clone({
      overrides: {
        printer: false,
        appState: { seeded: true },
        sessionManager: sm,
      },
    })

    expect(clone.appState.getAll()).toEqual({ seeded: true })
    expect(clone.sessionManager).toBe(sm)
    expect(template.sessionManager).toBeUndefined()
  })

  it('appends additionalPlugins to the template plugins', async () => {
    const basePlugin = makeNamedPlugin('base')
    const extraPlugin = makeNamedPlugin('extra')
    const template = new Agent({ model: new TestModelProvider(), tools: [], plugins: [basePlugin] })

    const clone = template.clone({ additionalPlugins: [extraPlugin] })

    // Both plugins should have been installed on the clone.
    await clone.initialize()
    expect(basePlugin.initialized).toBe(true)
    expect(extraPlugin.initialized).toBe(true)
  })

  it('carries unconnected McpClient instances into the clone and resolves them lazily', async () => {
    const client = makeFakeMcpClient('mcp_tool')
    const localTool = createMockTool('local_tool', () => 'x')
    const template = new Agent({
      model: new TestModelProvider(),
      tools: [localTool, client],
      printer: false,
    })

    // The template was never initialized: its MCP tools are not resolved yet.
    expect(client.listTools).not.toHaveBeenCalled()

    const clone = template.clone({ overrides: { printer: false } })

    // Cloning alone must not resolve MCP tools.
    expect(client.listTools).not.toHaveBeenCalled()
    // Before initialize the clone only knows the local tool.
    expect(clone.tools.map((t) => t.name)).toEqual(['local_tool'])

    // The clone resolves the SAME client on its own initialize() — no
    // template.initialize() required.
    await clone.initialize()
    expect(client.listTools).toHaveBeenCalledTimes(1)
    expect(clone.tools.map((t) => t.name).sort()).toEqual(['local_tool', 'mcp_tool'])
  })

  it('replaces plugins when overrides.plugins is supplied, then appends additionalPlugins', async () => {
    const base = makeNamedPlugin('base')
    const replacement = makeNamedPlugin('replacement')
    const extra = makeNamedPlugin('extra')
    const template = new Agent({ model: new TestModelProvider(), tools: [], plugins: [base] })

    const clone = template.clone({
      overrides: { plugins: [replacement] },
      additionalPlugins: [extra],
    })

    await clone.initialize()
    expect(base.initialized).toBe(false)
    expect(replacement.initialized).toBe(true)
    expect(extra.initialized).toBe(true)
  })
})
