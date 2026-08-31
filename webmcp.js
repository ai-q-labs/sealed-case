/**
 * Sealed Case — WebMCP surface.
 *
 * Two things are worth reading closely here.
 *
 * 1. TOOLS ARE REGISTERED PER PHASE. Each phase gets its own AbortController;
 *    when the phase changes we abort the previous one and register the next
 *    set. An agent connected to this page sees only the tools that are legal
 *    right now, and gets a `toolchange` event when that set moves. This is the
 *    game's turn structure expressed directly in the tool surface rather than
 *    in prose the agent has to be trusted to follow.
 *
 * 2. THERE IS NO `confirm_accusation` TOOL, AND THERE NEVER WILL BE. An agent
 *    can assemble an accusation and stage it. Resolving it is a click, in the
 *    page, by the person sitting there. The most consequential action in the
 *    product is deliberately absent from the agent's vocabulary.
 */

import { PHASES } from "./engine.js";

const ok = (obj) => ({
  content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
});

export function isSupported() {
  return typeof document !== "undefined" && "modelContext" in document;
}

/**
 * @param {ReturnType<import("./engine.js").createEngine>} engine
 * @param {(msg: {tool: string, detail: string}) => void} onCall  page-side log
 */
export function connectWebMCP(engine, onCall) {
  if (!isSupported()) return { supported: false, stop() {} };

  const mc = document.modelContext;
  let phaseController = null;
  let currentPhase = null;

  const log = (tool, detail) => onCall?.({ tool, detail });

  /** Tools that exist in every phase. */
  const alwaysController = new AbortController();

  const register = (tool, controller) =>
    mc.registerTool(tool, { signal: controller.signal });

  // ---- always available ----------------------------------------------------

  register(
    {
      name: "read_case_file",
      description:
        "Read the case file for tonight's death at the Lantern Room: what happened, who the victim was, and when the police arrive. Start here.",
      inputSchema: { type: "object", properties: {} },
      execute() {
        log("read_case_file", "");
        return ok(engine.caseFile());
      },
    },
    alwaysController,
  );

  register(
    {
      name: "list_suspects",
      description:
        "List the three people still in the building, with their stated movements tonight. Use the returned ids when interviewing or accusing.",
      inputSchema: { type: "object", properties: {} },
      execute() {
        log("list_suspects", "");
        return ok(engine.suspects());
      },
    },
    alwaysController,
  );

  register(
    {
      name: "get_progress",
      description:
        "Check where the investigation stands: current phase, how many objects are still unexamined, how many questions the suspects will still answer, and whether an accusation is staged.",
      inputSchema: { type: "object", properties: {} },
      execute() {
        const s = engine.get();
        log("get_progress", `${s.phase}, ${s.interviewsLeft} questions left`);
        return ok({
          phase: s.phase,
          objects_not_yet_examined: s.objectsLeft,
          questions_left: s.interviewsLeft,
          accusation_staged: s.pending ? s.pending.readable : null,
          note:
            "You cannot confirm an accusation. Only the player can, by clicking Confirm in the page.",
        });
      },
    },
    alwaysController,
  );

  // ---- per phase -----------------------------------------------------------

  function briefingTools(c) {
    register(
      {
        name: "begin_investigation",
        description:
          "Open the investigation. This unlocks searching the room and questioning the three suspects. Call it once the player has heard the case file.",
        inputSchema: { type: "object", properties: {} },
        execute() {
          const r = engine.beginInvestigation();
          log("begin_investigation", r.ok ? "opened" : r.error);
          return ok(r);
        },
      },
      c,
    );
  }

  function investigationTools(c) {
    register(
      {
        name: "search_room",
        description:
          "List everything in the Lantern Room that can be looked at, and whether it has been examined yet. Use this to decide what to examine next.",
        inputSchema: { type: "object", properties: {} },
        execute() {
          log("search_room", "");
          return ok(engine.searchable());
        },
      },
      c,
    );

    register(
      {
        name: "examine",
        description:
          "Examine one object in the room and get exactly what a person standing there would see. What you get back is all there is; the page does not withhold detail from an object you have examined, and it does not have more to give if you examine it twice.",
        inputSchema: {
          type: "object",
          properties: {
            object_id: {
              type: "string",
              description:
                "Id from search_room, e.g. bottle, glass, bolt, ledger, manuscript, photograph, clipping, back_door.",
            },
          },
          required: ["object_id"],
        },
        execute({ object_id }) {
          const r = engine.examine(object_id);
          log("examine", object_id);
          return ok(r);
        },
      },
      c,
    );

    register(
      {
        name: "interview",
        description:
          "Ask one suspect about one topic. Their answer is written by the page, not by you — quote it, do not invent it. Questions are limited: the suspects stop answering after eight in total, so choose them well.",
        inputSchema: {
          type: "object",
          properties: {
            suspect_id: {
              type: "string",
              enum: ["torii", "kuroda", "onodera"],
              description: "Who to ask.",
            },
            topic: {
              type: "string",
              description:
                "What to ask about. Understood topics: victim, alibi, bottle, photograph, clipping, manuscript.",
            },
          },
          required: ["suspect_id", "topic"],
        },
        execute({ suspect_id, topic }) {
          const r = engine.interview(suspect_id, topic);
          log("interview", `${suspect_id} / ${topic}`);
          return ok(r);
        },
      },
      c,
    );

    register(
      {
        name: "review_notebook",
        description:
          "Read back everything gathered so far: physical evidence, testimony, what has not been examined yet, and how many questions remain.",
        inputSchema: { type: "object", properties: {} },
        execute() {
          log("review_notebook", "");
          return ok(engine.notebook());
        },
      },
      c,
    );

    register(
      {
        name: "get_accusation_options",
        description:
          "List the exact culprit, method and motive values an accusation must be built from. Call this before proposing one.",
        inputSchema: { type: "object", properties: {} },
        execute() {
          log("get_accusation_options", "");
          return ok(engine.accusationOptions());
        },
      },
      c,
    );

    register(
      {
        name: "propose_accusation",
        description:
          "Put an accusation on the table: who, how, and why. This STAGES the accusation and raises a confirmation card in the page. It does not resolve anything. There is no tool that resolves it — the player must click Confirm themselves. Say out loud what you are staging and why before you call this.",
        inputSchema: {
          type: "object",
          properties: {
            culprit: {
              type: "string",
              enum: ["torii", "kuroda", "onodera", "nobody"],
            },
            method: {
              type: "string",
              enum: ["forced_bolt", "hidden_exit", "no_entry_needed", "accident"],
            },
            motive: {
              type: "string",
              enum: ["rejected_manuscript", "career", "old_death", "none"],
            },
            reasoning: {
              type: "string",
              description:
                "One or two sentences of the case you are making, shown to the player on the confirmation card.",
            },
          },
          required: ["culprit", "method", "motive"],
        },
        execute(args) {
          const r = engine.proposeAccusation(args);
          log("propose_accusation", `${args.culprit} / ${args.method} / ${args.motive}`);
          return ok(r);
        },
      },
      c,
    );

    register(
      {
        name: "withdraw_accusation",
        description:
          "Take a staged accusation back off the table, for instance if the player says they are not convinced.",
        inputSchema: { type: "object", properties: {} },
        execute() {
          log("withdraw_accusation", "");
          return ok(engine.withdrawAccusation());
        },
      },
      c,
    );
  }

  function verdictTools(c) {
    register(
      {
        name: "read_epilogue",
        description:
          "Read the closing account of what actually happened. Available only after the player has confirmed a correct accusation — before that, the page will refuse, and you have no other way to obtain it.",
        inputSchema: { type: "object", properties: {} },
        execute() {
          const r = engine.solutionText();
          log("read_epilogue", r.ok ? "released" : "refused");
          return ok(r);
        },
      },
      c,
    );

    register(
      {
        name: "reopen_case",
        description:
          "Go back to the investigation after a wrong accusation. The evidence already gathered is kept.",
        inputSchema: { type: "object", properties: {} },
        execute() {
          const r = engine.reopen();
          log("reopen_case", r.ok ? "reopened" : r.error);
          return ok(r);
        },
      },
      c,
    );

    register(
      {
        name: "restart_case",
        description: "Clear everything and start the night over from the case file.",
        inputSchema: { type: "object", properties: {} },
        execute() {
          log("restart_case", "");
          return ok(engine.restart());
        },
      },
      c,
    );
  }

  /** Swap the tool surface whenever the phase moves. */
  function syncPhase(phase) {
    if (phase === currentPhase) return;
    phaseController?.abort();
    phaseController = new AbortController();
    currentPhase = phase;

    if (phase === PHASES.BRIEFING) briefingTools(phaseController);
    else if (phase === PHASES.INVESTIGATION) investigationTools(phaseController);
    else if (phase === PHASES.VERDICT) verdictTools(phaseController);

    log("(tools changed)", `phase → ${phase}`);
  }

  const unsubscribe = engine.subscribe((s) => syncPhase(s.phase));

  return {
    supported: true,
    stop() {
      unsubscribe();
      phaseController?.abort();
      alwaysController.abort();
    },
  };
}
