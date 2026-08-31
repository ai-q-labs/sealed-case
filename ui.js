/**
 * Sealed Case — the human interface.
 *
 * Every action an agent can take through WebMCP, a person can take here with a
 * click, and the two drive the same engine. That is on purpose: WebMCP is a
 * progressive enhancement, so the page is complete without an agent, and an
 * agent joining mid-game inherits exactly the state the player built.
 *
 * The one asymmetry runs the other way. Confirming an accusation exists only
 * here, as a button. No tool reaches it.
 */

import { createEngine, CASE, PHASES } from "./engine.js";
import { connectWebMCP, isSupported } from "./webmcp.js";

const engine = createEngine();

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Last thing that happened, shown in the middle column. */
let focus = null; // { kind: "found"|"said"|"none", ... }

// ---------------------------------------------------------------------------
// agent panel
// ---------------------------------------------------------------------------

const TOOLS_BY_PHASE = {
  [PHASES.BRIEFING]: ["read_case_file", "list_suspects", "get_progress", "begin_investigation"],
  [PHASES.INVESTIGATION]: [
    "read_case_file",
    "list_suspects",
    "get_progress",
    "search_room",
    "examine",
    "interview",
    "review_notebook",
    "get_accusation_options",
    "propose_accusation",
    "withdraw_accusation",
  ],
  [PHASES.VERDICT]: [
    "read_case_file",
    "list_suspects",
    "get_progress",
    "read_epilogue",
    "reopen_case",
    "restart_case",
  ],
};

function renderToolset(phase) {
  const list = $("toolset");
  list.replaceChildren();
  for (const name of TOOLS_BY_PHASE[phase] || []) {
    list.append(el("li", null, name));
  }
  list.append(el("li", "forbidden", "confirm_accusation"));
}

let callCount = 0;
function logCall({ tool, detail }) {
  const list = $("calls");
  if (callCount === 0) list.replaceChildren();
  callCount += 1;
  const li = el("li", tool.startsWith("(") ? "phase" : null);
  const t = el("span", "t", tool);
  li.append(t);
  if (detail) li.append(" ", el("span", "d", detail));
  list.prepend(li);
  while (list.children.length > 60) list.lastChild.remove();
}

// ---------------------------------------------------------------------------
// left rail
// ---------------------------------------------------------------------------

function renderRoom(s) {
  const open = s.phase === PHASES.INVESTIGATION;
  $("room-hint").textContent = open
    ? "Click anything to look at it."
    : s.phase === PHASES.BRIEFING
      ? "Not yet open. Read the case file first."
      : "The night is over.";

  const list = $("objects");
  list.replaceChildren();
  for (const o of engine.searchable()) {
    const li = el("li");
    const b = el("button", "obj" + (o.examined ? " done" : ""));
    b.append(document.createTextNode(o.label));
    b.append(el("span", "where", o.where));
    b.disabled = !open;
    b.addEventListener("click", () => doExamine(o.id));
    li.append(b);
    list.append(li);
  }
}

function renderSuspects() {
  const list = $("suspects");
  if (list.children.length) return; // static
  for (const s of engine.suspects()) {
    const li = el("li");
    li.append(el("span", "name", s.name));
    li.append(el("span", "role", `${s.role} · ${s.age}`));
    li.append(el("span", "moves", s.known_movements));
    list.append(li);
  }
}

// ---------------------------------------------------------------------------
// actions (shared by the buttons here and the tools in webmcp.js)
// ---------------------------------------------------------------------------

function doExamine(id) {
  const r = engine.examine(id);
  if (r.ok) focus = { kind: "found", label: r.label, where: r.where, text: r.found };
  render(engine.get());
}

function doInterview(suspectId, topic) {
  const r = engine.interview(suspectId, topic);
  if (r.ok) focus = { kind: "said", who: r.suspect, topic: r.topic, text: r.said };
  else focus = { kind: "note", text: r.error };
  render(engine.get());
}

// ---------------------------------------------------------------------------
// centre stage
// ---------------------------------------------------------------------------

function renderStage(s) {
  const body = $("stage-body");
  body.replaceChildren();

  if (s.phase === PHASES.BRIEFING) return renderBriefing(body);
  if (s.phase === PHASES.INVESTIGATION) return renderInvestigation(body, s);
  return renderVerdict(body, s);
}

function renderBriefing(body) {
  if (!isSupported()) body.append(setupNotice());

  body.append(el("p", "kicker", "Case file"));
  body.append(el("h2", null, CASE.title));

  const f = engine.caseFile();
  const p = el("p", "prose lede", f.briefing);
  body.append(p);

  body.append(el("hr", "divider"));
  body.append(
    el(
      "p",
      null,
      `Victim: ${f.victim.name}, ${f.victim.age}. ${f.victim.role}. ${f.victim.note}`,
    ),
  );

  const controls = el("div", "controls");
  const go = el("button", "act primary", "Open the investigation");
  go.addEventListener("click", () => {
    engine.beginInvestigation();
    focus = null;
    render(engine.get());
  });
  controls.append(go);
  body.append(controls);
}

function setupNotice() {
  const n = el("div", "notice");
  const p1 = el("p");
  p1.append(
    document.createTextNode("This page is playable as it is. To hand the table to an agent, open it in "),
  );
  p1.append(el("strong", null, "ChatGPT's in-app browser"));
  p1.append(document.createTextNode(", or in Chrome 149+ with "));
  p1.append(el("code", null, "chrome://flags/#enable-webmcp-testing"));
  p1.append(document.createTextNode(" enabled, then ask it to investigate."));
  n.append(p1);
  n.append(
    el(
      "p",
      null,
      "Nothing about the mystery changes either way — the agent gets the same tools you get buttons for.",
    ),
  );
  return n;
}

function renderInvestigation(body, s) {
  body.append(el("p", "kicker", `The Lantern Room · ${s.objectsLeft} things not yet looked at`));
  body.append(el("h2", null, "What do you make of it?"));

  // the last thing that happened
  if (focus?.kind === "found") {
    const d = el("div", "find");
    d.append(el("p", "find-label", `${focus.label} — ${focus.where}`));
    d.append(el("p", "prose", focus.text));
    body.append(d);
  } else if (focus?.kind === "said") {
    const d = el("div", "said");
    d.append(el("p", "who", `${focus.who} · on ${focus.topic}`));
    const q = el("blockquote");
    q.textContent = focus.text;
    d.append(q);
    body.append(d);
  } else if (focus?.kind === "note") {
    body.append(el("p", "prose", focus.text));
  } else {
    body.append(
      el(
        "p",
        "prose lede",
        "The bolt is closed. The glass is half full. Three people are downstairs waiting for you to ask them something.\n\nLook at the room on the left, or put a question to one of them.",
      ),
    );
  }

  body.append(askForm(s));

  // notebook summary
  const nb = engine.notebook();
  if (nb.evidence.length || nb.testimony.length) {
    body.append(el("hr", "divider"));
    body.append(el("p", "kicker", "Notebook"));
    for (const line of nb.evidence) body.append(el("p", null, `— ${line}`));
    for (const line of nb.testimony) body.append(el("p", null, `— ${line}`));
  }

  // staged accusation, or the way to stage one
  if (s.pending) body.append(confirmCard(s.pending));
  else body.append(accuseForm());
}

function askForm(s) {
  const wrap = el("div", "ask");
  const spent = s.interviewsLeft;

  const who = el("div");
  who.append(el("label", null, "Ask"));
  const selWho = el("select");
  for (const sus of engine.suspects()) {
    const o = el("option", null, sus.name);
    o.value = sus.id;
    selWho.append(o);
  }
  who.append(selWho);

  const what = el("div");
  what.append(el("label", null, "About"));
  const selWhat = el("select");
  for (const t of ["victim", "alibi", "bottle", "photograph", "clipping", "manuscript"]) {
    const o = el("option", null, t);
    o.value = t;
    selWhat.append(o);
  }
  what.append(selWhat);

  const act = el("div");
  const b = el("button", "act", "Put the question");
  b.disabled = spent <= 0;
  b.addEventListener("click", () => doInterview(selWho.value, selWhat.value));
  act.append(b);

  wrap.append(who, what, act);

  const holder = el("div");
  holder.append(wrap);
  const budget = el(
    "p",
    "budget" + (spent <= 2 ? " low" : ""),
    spent > 0
      ? `${spent} question${spent === 1 ? "" : "s"} left before they stop answering.`
      : "They have stopped answering.",
  );
  holder.append(budget);
  return holder;
}

function accuseForm() {
  const wrap = el("div");
  wrap.append(el("hr", "divider"));
  wrap.append(el("p", "kicker", "Name it"));

  const opts = engine.accusationOptions();
  const grid = el("div", "ask");

  const mk = (label, entries) => {
    const d = el("div");
    d.append(el("label", null, label));
    const sel = el("select");
    for (const e of entries) {
      const o = el("option", null, e.label);
      o.value = e.id;
      sel.append(o);
    }
    d.append(sel);
    grid.append(d);
    return sel;
  };

  const c = mk("Who", opts.culprit);
  const m = mk("How", opts.method);
  const w = mk("Why", opts.motive);

  const act = el("div");
  const b = el("button", "act", "Put it on the table");
  b.addEventListener("click", () => {
    engine.proposeAccusation({ culprit: c.value, method: m.value, motive: w.value });
    render(engine.get());
  });
  act.append(b);
  grid.append(act);

  wrap.append(grid);
  return wrap;
}

function confirmCard(p) {
  const card = el("div", "confirm");
  card.append(el("p", "kicker", "On the table"));

  const dl = el("dl");
  dl.append(el("dt", null, "Who"), el("dd", null, p.readable.culprit));
  dl.append(el("dt", null, "How"), el("dd", null, p.readable.method));
  dl.append(el("dt", null, "Why"), el("dd", null, p.readable.motive));
  card.append(dl);

  if (p.reasoning) card.append(el("p", "why", p.reasoning));

  card.append(
    el(
      "p",
      "gate",
      "This is where the agent has to stop. Confirming an accusation is not one of the tools it has.",
    ),
  );

  const controls = el("div", "controls");
  const yes = el("button", "act primary", "Confirm the accusation");
  yes.addEventListener("click", () => {
    engine.confirmAccusation();
    focus = null;
    render(engine.get());
  });
  const no = el("button", "act quiet", "Take it back");
  no.addEventListener("click", () => {
    engine.withdrawAccusation();
    render(engine.get());
  });
  controls.append(yes, no);
  card.append(controls);
  return card;
}

function renderVerdict(body, s) {
  const v = s.verdict;
  body.append(el("p", "kicker", "06:00 — the police are on the stairs"));

  const mark = el(
    "span",
    "verdict-mark " + (v.correct ? "right" : "wrong"),
    v.correct ? "The case is closed" : "That was not it",
  );
  body.append(mark);

  body.append(el("h2", null, v.correct ? "You had it" : "Not quite"));

  const parts = el("ul", "parts");
  const row = (k, label, value) => {
    const li = el("li", v.parts[k] ? "yes" : "no");
    li.append(el("b", null, label + ": "));
    li.append(document.createTextNode(value));
    parts.append(li);
  };
  row("culprit", "Who", v.accused.culprit);
  row("method", "How", v.accused.method);
  row("motive", "Why", v.accused.motive);
  body.append(parts);

  if (v.correct) {
    body.append(el("hr", "divider"));
    body.append(el("p", "kicker", "What happened"));
    body.append(el("p", "prose", v.epilogue));

    body.append(el("hr", "divider"));
    const pitch = el("p");
    pitch.append(
      document.createTextNode(
        "This was written for one player and an agent. The ones we sell are written for three to seven people around a table — ",
      ),
    );
    const a = el("a", null, "AiQ Labs on itch.io");
    a.href = "https://aiqlabs.itch.io/";
    a.rel = "noopener";
    pitch.append(a);
    pitch.append(document.createTextNode("."));
    body.append(pitch);
  } else {
    body.append(el("p", "prose lede", v.hint));
  }

  const controls = el("div", "controls");
  if (!v.correct) {
    const again = el("button", "act primary", "Go back to it");
    again.addEventListener("click", () => {
      engine.reopen();
      focus = null;
      render(engine.get());
    });
    controls.append(again);
  }
  const restart = el("button", "act quiet", "Start the night over");
  restart.addEventListener("click", () => {
    engine.restart();
    focus = null;
    callCount = 0;
    $("calls").replaceChildren(el("li", "calls-empty", "Nothing yet."));
    render(engine.get());
  });
  controls.append(restart);
  body.append(controls);
}

// ---------------------------------------------------------------------------

function render(s) {
  renderStage(s);
  renderRoom(s);
  renderToolset(s.phase);
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

renderSuspects();
engine.subscribe(render);

const status = $("mcp-status");
const conn = connectWebMCP(engine, logCall);
if (conn.supported) {
  status.classList.add("live");
  status.querySelector(".status-text").textContent = "WebMCP connected · tools registered";
} else {
  status.classList.add("absent");
  status.querySelector(".status-text").textContent = "WebMCP not available in this browser";
}

// Keep a hook for the demo, but only for reading. There is deliberately no
// path from here to the solution: `engine` never exposes it.
window.sealedCase = { engine, phases: PHASES };

// `?demo=1` runs the narrated walkthrough used for the demo video. It drives
// the real tools and stops at the confirmation card, because that click is the
// one thing in this project that has to be a person's.
if (new URLSearchParams(location.search).has("demo")) {
  const demo = await import("./demo.js");
  demo.watchForVerdict(engine);
  demo.runDemo(engine);
}
