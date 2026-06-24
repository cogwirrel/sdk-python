import {
  Agent,
  McpClient,
  SessionManager,
  FileStorage,
  type Snapshot,
} from '@strands-agents/sdk'
import type { Plugin } from '@strands-agents/sdk'

declare const mcpClient: McpClient
declare const statelessPlugin: Plugin
declare const statefulPlugin: Plugin

// Take snapshot example
async function takeSnapshotExample() {
  // --8<-- [start:take_snapshot]
  const agent = new Agent({ systemPrompt: 'You are a helpful assistant' })
  await agent.invoke('Hello!')
  agent.appState.set('user_id', 'user-123')

  // Capture a snapshot with the session preset
  const snapshot = agent.takeSnapshot({ preset: 'session' })

  console.log(snapshot.schemaVersion) // "1.0"
  console.log(snapshot.createdAt) // ISO 8601 timestamp
  console.log(Object.keys(snapshot.data)) // messages, state, systemPrompt, modelState, interrupts
  // --8<-- [end:take_snapshot]
}

// Load snapshot example
async function loadSnapshotExample() {
  // --8<-- [start:load_snapshot]
  const agent = new Agent({ systemPrompt: 'You are a helpful assistant' })
  await agent.invoke('Hello!')

  // Take a snapshot
  const snapshot = agent.takeSnapshot({ preset: 'session' })

  // Continue the conversation
  await agent.invoke('Tell me a joke')
  await agent.invoke('Tell me another one')

  // Restore to the earlier state
  agent.loadSnapshot(snapshot)

  // The agent is back to the state after "Hello!"
  console.log(agent.messages.length) // Only the messages from before the jokes
  // --8<-- [end:load_snapshot]
}

// Field selection example
async function fieldSelectionExample() {
  const agent = new Agent()

  // --8<-- [start:field_selection]
  // Capture only messages and state (no preset)
  const messagesOnly = agent.takeSnapshot({ include: ['messages', 'state'] })

  // Session preset minus systemPrompt
  const noPrompt = agent.takeSnapshot({ preset: 'session', exclude: ['systemPrompt'] })
  // --8<-- [end:field_selection]
}

// App data example
async function appDataExample() {
  const agent = new Agent()

  // --8<-- [start:app_data]
  const snapshot = agent.takeSnapshot({
    preset: 'session',
    appData: {
      snapshotLabel: 'After onboarding',
      workflowStep: 3,
      userDisplayName: 'Alice',
    },
  })

  // Access app data later
  console.log(snapshot.appData.snapshotLabel) // "After onboarding"
  console.log(snapshot.appData.userDisplayName) // "Alice"
  // --8<-- [end:app_data]
}

// Serialization example
async function serializationExample() {
  // --8<-- [start:serialization]
  const agent = new Agent()
  await agent.invoke('Hello!')

  // Take a snapshot
  const snapshot = agent.takeSnapshot({ preset: 'session' })

  // Serialize to JSON string
  const jsonString = JSON.stringify(snapshot)

  // Store to file, database, S3, etc.
  // ...

  // Later, restore from JSON
  const parsed: Snapshot = JSON.parse(jsonString)

  // Load into a new agent
  const newAgent = new Agent()
  newAgent.loadSnapshot(parsed)
  // --8<-- [end:serialization]
}

// Checkpointing example
async function checkpointingExample() {
  // --8<-- [start:checkpointing]
  const agent = new Agent({ systemPrompt: 'You are a research assistant' })

  // Step 1: Gather information
  await agent.invoke('Research the latest trends in AI agents')
  const checkpoint1 = agent.takeSnapshot({ preset: 'session' })

  // Step 2: Analyze (might fail or produce poor results)
  await agent.invoke('Analyze the key themes and summarize')
  const checkpoint2 = agent.takeSnapshot({ preset: 'session' })

  // If step 2 didn't go well, roll back to checkpoint 1
  agent.loadSnapshot(checkpoint1)
  await agent.invoke('Focus specifically on multi-agent systems and summarize')
  // --8<-- [end:checkpointing]
}

// Branching conversations example
async function branchingExample() {
  // --8<-- [start:branching]
  const agent = new Agent({ systemPrompt: 'You are a creative writer' })
  await agent.invoke('Write the opening paragraph of a mystery novel')

  // Save the branch point
  const branchPoint = agent.takeSnapshot({ preset: 'session' })

  // Branch A: formal tone
  await agent.invoke('Continue in a formal, academic tone')
  const formalSnapshot = agent.takeSnapshot({ preset: 'session' })

  // Branch B: go back and try casual tone
  agent.loadSnapshot(branchPoint)
  await agent.invoke('Continue in a casual, conversational tone')
  const casualSnapshot = agent.takeSnapshot({ preset: 'session' })
  // --8<-- [end:branching]
}

// Basic clone
function basicCloneExample() {
  // --8<-- [start:clone_basic]
  const template = new Agent({
    model: 'global.anthropic.claude-sonnet-4-6',
    systemPrompt: 'You are a helpful assistant',
    tools: [mcpClient],
  })

  // Build a fresh agent wired up exactly like the template.
  const clone = template.clone()
  // --8<-- [end:clone_basic]
  return clone
}

// Per-session isolation
function clonePerSessionExample(sessionId: string) {
  const template = new Agent({
    model: 'global.anthropic.claude-sonnet-4-6',
    tools: [mcpClient],
  })
  // --8<-- [start:clone_per_session]
  // Each session gets its own SessionManager (otherwise all clones would
  // share one session) and a disabled printer.
  const perSession = template.clone({
    overrides: {
      sessionManager: new SessionManager({
        sessionId,
        storage: { snapshot: new FileStorage('./sessions') },
      }),
      printer: false,
    },
  })
  // --8<-- [end:clone_per_session]
  return perSession
}

// Stateful plugins: share vs isolate
function clonePluginExample() {
  // --8<-- [start:clone_plugins]
  // A plugin in the template's constructor is shared across every clone —
  // fine for stateless plugins.
  const template = new Agent({
    model: 'global.anthropic.claude-sonnet-4-6',
    plugins: [statelessPlugin], // shared by all clones
  })

  // Give a clone its own plugin instance via additionalPlugins — use this for
  // plugins that hold per-session mutable state.
  const clone = template.clone({
    additionalPlugins: [statefulPlugin],
  })
  // --8<-- [end:clone_plugins]
  return clone
}
