# ADR 0001: Alpaca Agent Rail Using Command Center AI

## Status and scope

Planned on 2026-10-09; corrected after inspecting published packages on 2026-10-10.
Implemented in the site and locally verified on 2026-10-14. This decision records the site
integration, not authorization to change backend or SDK architecture. Local verification does
not establish deployed connectivity.

Let the person open an **Alpaca Agent** conversation beside the current application page.
Reuse the existing Agent and the published conversation components. This decision does not
require a new Agent, tools, business API, database, or platform/SDK feature.

## Verified package support

The earlier conclusion that a new host rail-opening protocol was needed was incorrect: it
considered the base SDK alone and missed the separate Command Center AI package.

| Need | Existing public API |
| --- | --- |
| Launcher and responsive right rail, including Agent icon | Command Center AI: ChatLauncher, ChatRail |
| Conversation, composer, tool output, streaming and cancellation | Command Center AI: ChatThread |
| Session reuse, history, readiness and model selection | Command Center AI: ChatEngineProvider |
| Authenticated platform calls from the embedded site | Command Center SDK: client.sendPlatformRequest |
| Authenticated platform calls during standalone Vite development | Command Center SDK: platformRequestProxy |

Registry and published package inspection found Command Center SDK **0.5.17** and Command
Center AI **0.0.12**. AI's SDK peer range is ^0.5.3; embedded authentication requires SDK
0.5.5 or later, so these releases are compatible. A separately requested dependency update
on 2026-10-10 installed SDK **0.5.17** (declared as ^0.5.17) and AI **0.0.12** (declared as
^0.0.12), with their packaged skills. This replaces SDK 0.4.0. The current site uses AI 0.0.13;
the rail is implemented using the published components in `src/assistant.tsx`.

## Site implementation plan

1. Dependency preparation is complete: use the installed compatible SDK and AI releases and
   their version-matched skills. Keep one SDK and one React installation.
2. Mount one ChatEngineProvider above the site's routes. Use Alpaca Agent as the default
   target with one stable application session handle. Reuse the package's session behavior.
3. Add an **Ask Alpaca Agent** ChatLauncher and the package's ChatRail containing ChatThread.
   Keep the rail closed initially; opening it does not send a message. Use its documented
   docked layout on wide screens and overlay on narrow screens. Preserve page and form state.
   Load the AI stylesheet after the SDK styles; do not recreate its frame or chat controls.
4. Give createChatBackendConnection the existing iframe client's sendPlatformRequest method.
   In standalone Vite development use the SDK's platformRequestProxy, which keeps the
   developer's platform credential server-side. Let the AI package resolve runtime access
   and stream replies; do not implement a custom chat transport or message API.
5. Keep the site's existing Accounts key-entry flow and the Agent's existing tools unchanged.
   An unavailable assistant must not block the normal application pages.

A separate expanded chat application, session-management screens, automatic page-context
sharing, automatic refresh after Agent mutations, and changes to Agent deployment or tools
are not requirements of this ADR.

## Reuse the Alpaca API's Agent endpoint

The AI package's mount-agent-conversation guidance requires the Agent UID and its Environment
from the application's API, not an Environment picker or hardcoded deployment UIDs.
The user confirms that the Alpaca API already returns the Agent UID from an endpoint. Consume
that existing endpoint; do not add an endpoint, resolver, or platform binding for this plan.
The earlier absence claim was based on inspecting only the project-configuration response
and was not sufficient evidence that the API lacked the capability.

The implemented integration reads `GET /v1/project-state/configuration`: `agent_uid` and
`organization_environment_uid` come from the Alpaca API, with no new site-owned resolver or
binding. Embedded contract tests verify host bridge calls and unavailable-Agent behavior;
package inspection and fixtures alone do not prove deployed connectivity.

The separately authorized full local launch uses the published SDK `localAgentProxy()` and
AI `createLocalAgentSource()` against the Agent on this machine, without resolving a deployed
Agent or session. Startup, a live Luna reply, and no-fallback browser checks passed. Local Alpaca
application-MCP tools remain unavailable pending [TAU #102](https://github.com/mainsequence-sdk/ms-tau-sdk/issues/102);
no custom adapter or deployed-service workaround is installed. The launch and its constraints
are documented in the [README](../README.md#local-development).

## Acceptance

- The launcher opens a conversation with Alpaca Agent using the published rail; closing and
  reopening preserves the conversation and the current application page.
- An explicit read-only request streams a response and tool output from the existing Agent.
- Loading, unavailable, access-denied and failed-turn states use the package's behavior;
  normal site workflows remain usable. No browser-held platform token is introduced.
- Verify docked/overlay layouts and themes, then run the site's check, build and end-to-end
  tests under its required Node 24 runtime. Verify embedded and local platform connections
  separately; do not report fixtures as live deployment proof.

## Evidence

Reviewed the npm releases' package manifests, public declarations and bundled guides:

- [Command Center SDK 0.5.17](https://www.npmjs.com/package/@dev-mainsequence/command-center-sdk/v/0.5.17):
  getting-started AI guidance and the public embed/vite declarations.
- [Command Center AI 0.0.12](https://www.npmjs.com/package/@dev-mainsequence/command-center-ai/v/0.0.12):
  use-command-center-ai, mount-agent-conversation, compose-command-center-ai-rail and
  connect-command-center-ai-to-the-platform skills, plus public component declarations.
- Current [application root](../src/App.tsx), [transport](../src/transport.ts),
  [account-key forms](../src/accounts.tsx) and [dependency manifest](../package.json).

Engineering ADRs remain outside the published /docs/ user guide.
