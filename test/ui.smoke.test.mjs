/**
 * A DOM thin enough to run ui.js under `node --test`, so that a typo in a
 * render path fails here instead of in front of a judge. It is not a browser
 * and does not pretend to be one — it exists so the whole UI can be driven
 * through a full playthrough headlessly.
 */

import test from "node:test";
import assert from "node:assert/strict";

// --- the smallest DOM that ui.js actually uses ------------------------------

class Node_ {
  constructor(tag) {
    this.tagName = String(tag || "").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._text = "";
    this.className = "";
    this.value = "";
    this.disabled = false;
    this.href = "";
    this.rel = "";
    this._handlers = {};
    this.classList = {
      add: (...c) => {
        const set = new Set(this.className.split(" ").filter(Boolean));
        c.forEach((x) => set.add(x));
        this.className = [...set].join(" ");
      },
      contains: (c) => this.className.split(" ").includes(c),
    };
  }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join("");
    return this._text;
  }
  set textContent(v) {
    this.children = [];
    this._text = String(v);
  }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === "string" ? Object.assign(new Node_("#text"), { _text: n }) : n;
      node.parentNode = this;
      this.children.push(node);
      // a <select> reports its first <option> until something picks another,
      // which is what a browser does and what the page assumes
      if (this.tagName === "SELECT" && node.tagName === "OPTION" && this.value === "") {
        this.value = node.value;
      }
    }
  }
  prepend(n) {
    n.parentNode = this;
    this.children.unshift(n);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this._text = "";
    if (nodes.length) this.append(...nodes);
  }
  remove() {
    const p = this.parentNode;
    if (!p) return;
    p.children = p.children.filter((c) => c !== this);
  }
  addEventListener(type, fn) {
    (this._handlers[type] ||= []).push(fn);
  }
  click() {
    if (this.disabled) throw new Error("clicked a disabled control");
    for (const fn of this._handlers.click || []) fn();
  }
  /** depth-first search by class name */
  find(cls) {
    if (this.classList.contains(cls)) return this;
    for (const c of this.children) {
      const hit = c.find?.(cls);
      if (hit) return hit;
    }
    return null;
  }
  findAll(cls, out = []) {
    if (this.classList.contains(cls)) out.push(this);
    for (const c of this.children) c.findAll?.(cls, out);
    return out;
  }
  querySelector(sel) {
    return this.find(sel.replace(/^\./, ""));
  }
}

const ids = {};
for (const id of [
  "mcp-status",
  "stage-body",
  "room-hint",
  "objects",
  "suspects",
  "envelope",
  "toolset",
  "calls",
]) {
  ids[id] = new Node_("div");
}
ids["mcp-status"].append(Object.assign(new Node_("span"), { className: "status-text" }));

globalThis.document = {
  getElementById: (id) => ids[id] || null,
  createElement: (tag) => new Node_(tag),
  createTextNode: (t) => Object.assign(new Node_("#text"), { _text: String(t) }),
  // no `modelContext`: this run exercises the no-WebMCP path
};
globalThis.window = {};
// no `?demo=1`, so this run exercises the ordinary interactive path
globalThis.location = { search: "" };

const { default: _ } = await import("../ui.js").then((m) => ({ default: m }));

// --- helpers ----------------------------------------------------------------

const stage = () => ids["stage-body"];
const buttons = () => stage().findAll("act");
const byLabel = (text) =>
  buttons().find((b) => b.textContent.toLowerCase().includes(text.toLowerCase()));
const objectButtons = () => ids["objects"].findAll("obj");

// --- tests ------------------------------------------------------------------

test("the briefing renders and offers to open the investigation", () => {
  assert.match(stage().textContent, /Lantern Room/);
  assert.match(stage().textContent, /Rentaro Kadokura/);
  assert.ok(byLabel("Open the investigation"), "the opening control is present");
});

test("without WebMCP the page says so and still plays", () => {
  assert.match(ids["mcp-status"].textContent, /not available/i);
  assert.match(stage().textContent, /enable-webmcp-testing/);
});

test("the room is disabled during the briefing", () => {
  const objs = objectButtons();
  assert.equal(objs.length, 8);
  assert.ok(objs.every((b) => b.disabled), "nothing is clickable yet");
});

test("a full playthrough: open, search, question, accuse, confirm, read", () => {
  byLabel("Open the investigation").click();

  const objs = objectButtons();
  assert.ok(objs.every((b) => !b.disabled), "the room opened");

  // look at everything
  for (const b of objectButtons()) b.click();
  assert.match(stage().textContent, /Notebook/);
  assert.ok(objectButtons().every((b) => b.classList.contains("done")));

  // ask a question through the form
  const askBtn = byLabel("Put the question");
  assert.ok(askBtn, "the interview control is present");
  askBtn.click();
  assert.match(stage().textContent, /on victim/);

  // stage an accusation with the defaults, then take it back
  byLabel("Put it on the table").click();
  assert.ok(stage().find("confirm"), "the confirmation card appeared");
  assert.match(stage().textContent, /agent has to stop/);
  byLabel("Take it back").click();
  assert.equal(stage().find("confirm"), null, "withdrawn");

  // now stage the right one by driving the selects
  const selects = stage()
    .findAll("ask")
    .flatMap((g) => g.children.flatMap((d) => d.children.filter((c) => c.tagName === "SELECT")));
  const accuse = selects.slice(-3);
  assert.equal(accuse.length, 3, "who / how / why");
  accuse[0].value = "kuroda";
  accuse[1].value = "no_entry_needed";
  accuse[2].value = "old_death";
  byLabel("Put it on the table").click();
  byLabel("Confirm the accusation").click();

  assert.match(stage().textContent, /The case is closed/);
  assert.match(stage().textContent, /aconite/, "the epilogue is released to the player");
});

test("a wrong accusation gives a hint and lets you go back", () => {
  byLabel("Start the night over").click();
  byLabel("Open the investigation").click();
  byLabel("Put it on the table").click(); // defaults: torii / forced_bolt / rejected_manuscript
  byLabel("Confirm the accusation").click();

  assert.match(stage().textContent, /That was not it/);
  assert.ok(!/aconite/i.test(stage().textContent), "no epilogue for a wrong answer");
  byLabel("Go back to it").click();
  assert.ok(byLabel("Put the question"), "back in the investigation");
});

test("the forbidden tool is shown as forbidden in the agent panel", () => {
  const forbidden = ids["toolset"].findAll("forbidden");
  assert.equal(forbidden.length, 1);
  assert.equal(forbidden[0].textContent, "confirm_accusation");
});
