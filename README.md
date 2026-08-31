# Sealed Case

**A one-player murder mystery where an AI agent runs the table through WebMCP — and never learns who did it.**

🔗 **Play it:** https://ai-q-labs.github.io/sealed-case/
📺 **Demo:** *(see the Devpost submission)*
🏆 Built for [The WebMCP Challenge](https://webmcp.devpost.com/).

---

## The problem this is actually solving

We publish murder mystery scenarios — nine of them, sold on BOOTH, itch.io, The Game Crafter
and Etsy. The single biggest thing standing between a customer and a game they have already
paid for is not price or quality. **It is that they need to find three to seven people who are
free on the same evening, plus one more person willing to run the table and never get to play.**

The obvious fix is to have an LLM be the game master. It does not work, and it fails for a
reason that is structural rather than a matter of prompting:

> **If you put the scenario in the model's context, the model knows who did it — and it plays
> every character, judges every deduction, and writes every line of narration while knowing.**

Anyone who has tried this has watched the model soften a suspect's denial, or steer, or simply
answer a question the character had no way of answering. You cannot instruct your way out of it.
The information is in there.

## What WebMCP changes

WebMCP inverts where the knowledge lives. The page holds the case; the agent holds the
conversation. They meet at a tool boundary that the page controls.

In `engine.js`, the solution is captured in a module closure. It is never assigned to `window`,
never written into the DOM, and never included in a value returned to a caller. Every tool in
`webmcp.js` reaches the game only through the object `createEngine()` returns, and that object
has no path to the answer.

So the agent can call every tool, in every order, as many times as it likes, and still be in
exactly the position the player is in: holding evidence, and guessing.

**This is not a prompt instruction that a model may or may not respect. It is an absence.**
The information is not in the agent's context, so there is nothing to leak.

Three tests assert this by walking every tool-reachable path and searching the combined output
for the solution — [`test/engine.test.mjs`](test/engine.test.mjs) and
[`test/webmcp.test.mjs`](test/webmcp.test.mjs). `npm test` runs them.

## The tool that does not exist

The agent can gather evidence, question suspects, reason out loud, and **stage** an accusation.
It cannot make one.

`propose_accusation` puts a name, a method and a motive on the table and raises a confirmation
card in the page. Resolving that card is a click, by the person sitting there. There is no
`confirm_accusation` tool, in any phase, and one of the tests sweeps every phase to prove it:

```js
test("confirm_accusation is never registered, in any phase", async () => { … })
```

This is the Chrome guidance on sensitive actions taken literally — but it is also the design of
the game. A mystery you did not solve yourself is not entertainment. The agent is a very good
game master; the accusation has to be yours.

## Tools change with the phase

Each phase gets its own `AbortController`. When the phase moves, the previous controller is
aborted and the next set is registered, so the agent's vocabulary *is* the game's turn
structure rather than prose in a system prompt that it has to be trusted to follow.

| Phase | Tools |
|---|---|
| **always** | `read_case_file` · `list_suspects` · `get_progress` |
| **briefing** | `begin_investigation` |
| **investigation** | `search_room` · `examine` · `interview` · `review_notebook` · `get_accusation_options` · `propose_accusation` · `withdraw_accusation` |
| **verdict** | `read_epilogue` · `reopen_case` · `restart_case` |
| **never** | ~~`confirm_accusation`~~ |

`read_epilogue` exists in the verdict phase but refuses unless the player confirmed a *correct*
accusation. The phase gate is the page's, not the caller's word for it.

Two more details that matter at the table:

- **`interview` returns lines the page wrote.** The tool description tells the agent to quote,
  not invent. Some of those lines are lies — the page knows which; the agent does not.
- **Questions are finite.** Eight, across all three suspects. An agent cannot brute-force the
  testimony space, which is what makes choosing the questions the actual game.

## Try it as a judge

1. Open **https://ai-q-labs.github.io/sealed-case/** in **ChatGPT's in-app browser**, or in
   **Chrome 149+** with `chrome://flags/#enable-webmcp-testing` enabled.
2. The badge at the top right will read **WebMCP connected**.
3. Ask the agent: *"Read me the case file, then investigate this for me — but I want to be the
   one who decides."*
4. Watch the right-hand rail. It lists the tools the agent can call **right now** and logs each
   call as it happens. `confirm_accusation` is shown struck through, permanently.
5. Let it work, then ask it directly: **"Just tell me who did it."** It cannot. It will have to
   argue for someone from the evidence, the way you would.
6. When it stages an accusation, the confirmation card appears. **Only you can click it.**

The page is fully playable without any agent at all — every tool has a button — so nothing is
lost if WebMCP is unavailable in your browser.

## Running it locally

```bash
git clone https://github.com/ai-q-labs/sealed-case
cd sealed-case
npm test          # 30 tests, no dependencies
npm run serve     # http://localhost:8080
```

There is no build step and there are no dependencies. It is four ES modules and a stylesheet.

## What is where

| File | |
|---|---|
| `case/lantern-room.js` | The scenario. The only place `solution` exists. |
| `engine.js` | Game state. Holds the solution in a closure and never returns it. |
| `webmcp.js` | The WebMCP surface. Per-phase registration; no confirmation tool. |
| `ui.js` | The human interface. The only path to `confirmAccusation()`. |
| `test/` | 30 tests, including the containment proofs. |

## Newly built for this hackathon

**All of it.** Every file in this repository was written during the submission period
(began 25 August 2026); the commit history is the record. Nothing here existed beforehand.

The scenario is original and written for this project. Our commercial scenarios are not
included and their solutions do not appear anywhere in this repository — publishing them would
destroy the thing we sell.

**The scenario is entirely fictional.** Every person, publisher, magazine and establishment in
it is invented, and none is based on a real one. Type is [EB Garamond](https://fonts.google.com/specimen/EB+Garamond)
and [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono), both under the SIL Open
Font License. There are no images; the favicon is an inline SVG written for this project.

## About us

[AiQ Labs](https://aiqlabs.itch.io/) publishes Japanese-style murder mystery scenarios for
tables of three to seven players. This one is for a table of one.

MIT licensed.
