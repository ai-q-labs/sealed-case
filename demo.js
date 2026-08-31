/**
 * A narrated walkthrough, for the demo video and for anyone who wants to see
 * the whole shape of the thing in two and a half minutes: open
 * `?demo=1`.
 *
 * Two things it deliberately does NOT do.
 *
 * It does not fake the agent. Every step below goes through
 * `document.modelContext.executeTool()` — the same path a real agent takes,
 * against the same registered tools. If WebMCP is unavailable it falls back to
 * the engine directly and says so on screen, rather than pretending.
 *
 * It does not click Confirm. The walkthrough stops at the confirmation card
 * and waits, because a human clicking that button is the point of the project.
 * Automating it here to make a smoother video would be a lie about what runs.
 */

const SCRIPT = [
  {
    say:
      "This is Sealed Case: a murder mystery for one player, where the game master is an AI agent. " +
      "The agent does not know who did it. Watch the panel on the right — those are the WebMCP tools " +
      "this page has registered, and every call the agent makes.",
    do: null,
  },
  {
    say:
      "The agent reads the case file, then opens the investigation. The tool set changes underneath it: " +
      "the briefing tool is retired and ten investigation tools appear. The page decides what the agent " +
      "is allowed to do next.",
    do: async (call) => {
      await call("read_case_file");
      await pause(600);
      await call("begin_investigation");
    },
  },
  {
    say:
      "It searches the room. Everything it learns comes back from a tool the page controls — the new cork " +
      "on the victim's bottle, the single glass, the bolt with only his own fingerprints on it, " +
      "and a thirty-year-old newspaper article framed in the stairwell.",
    do: async (call) => {
      for (const id of ["bottle", "glass", "bolt", "clipping"]) {
        await call("examine", { object_id: id });
        await pause(700);
      }
    },
  },
  {
    say:
      "It questions the suspects. These lines are written by the page, not by the model — some of them are " +
      "lies, and the page knows which. Questions are capped at eight, so the agent cannot exhaust the " +
      "testimony and work backwards.",
    do: async (call) => {
      await call("interview", { suspect_id: "kuroda", topic: "alibi" });
      await pause(900);
      await call("interview", { suspect_id: "kuroda", topic: "photograph" });
    },
  },
  {
    say:
      "Now the part that matters. Ask it who did it, and it cannot tell you — not because it was instructed " +
      "not to, but because the answer was never in its context. The solution is held in a closure that no " +
      "tool can reach.",
    do: null,
  },
  {
    say:
      "It can assemble an accusation and put it on the table. It cannot make one. There is no confirm tool, " +
      "in any phase — look at the panel: it is struck through, permanently. That click is mine.",
    do: async (call) => {
      await call("propose_accusation", {
        culprit: "kuroda",
        method: "no_entry_needed",
        motive: "old_death",
        reasoning:
          "The cork is new, only one glass was used, and the 1996 article hangs in his own stairwell.",
      });
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    },
  },
];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Caption bar, so the video reads with the sound off too. */
function makeCaption() {
  const bar = document.createElement("div");
  bar.id = "demo-caption";
  bar.setAttribute("role", "status");
  document.body.append(bar);
  return bar;
}

function speak(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve(false);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.98;
    u.pitch = 1.0;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      const en = voices.filter((v) => /^en(-|_)?/i.test(v.lang));
      // prefer a natural-sounding one when the platform offers a choice
      u.voice =
        en.find((v) => /natural|google|zira|aria/i.test(v.name)) || en[0] || null;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      speechSynthesis.speak(u);
    };
    if (speechSynthesis.getVoices().length) pick();
    else speechSynthesis.addEventListener("voiceschanged", pick, { once: true });
  });
}

/** Call a tool the way an agent would, or fall back and say so. */
function makeCaller(engine) {
  const viaWebMCP = "modelContext" in document;
  if (viaWebMCP) {
    return {
      viaWebMCP,
      async call(name, args) {
        const mc = document.modelContext;
        const tool = (await mc.getTools()).find((t) => t.name === name);
        if (!tool) throw new Error(`tool not registered in this phase: ${name}`);
        // Chrome's implementation takes the arguments as a JSON string.
        return mc.executeTool(tool, JSON.stringify(args || {}));
      },
    };
  }
  const direct = {
    read_case_file: () => engine.caseFile(),
    begin_investigation: () => engine.beginInvestigation(),
    examine: (a) => engine.examine(a.object_id),
    interview: (a) => engine.interview(a.suspect_id, a.topic),
    propose_accusation: (a) => engine.proposeAccusation(a),
  };
  return {
    viaWebMCP,
    async call(name, args) {
      const fn = direct[name];
      if (!fn) throw new Error(`no fallback for ${name}`);
      return fn(args || {});
    },
  };
}

export async function runDemo(engine) {
  const caption = makeCaption();
  const caller = makeCaller(engine);

  if (!caller.viaWebMCP) {
    caption.textContent =
      "WebMCP is not enabled in this browser — this walkthrough is driving the game directly instead of through tools.";
    caption.classList.add("warn");
    await pause(4500);
    caption.classList.remove("warn");
  }

  for (const step of SCRIPT) {
    caption.textContent = step.say;
    caption.classList.add("on");
    // narration and actions run together, so the tool calls land while the
    // sentence describing them is still being spoken
    const said = speak(step.say);
    if (step.do) await step.do(caller.call);
    await said;
    await pause(500);
  }

  caption.textContent = "Your turn: confirm the accusation.";
  caption.classList.add("prompt");
}

/** Wire the finale: once the human clicks Confirm, close the narration. */
export function watchForVerdict(engine) {
  let announced = false;
  engine.subscribe(async (s) => {
    if (announced || !s.verdict) return;
    announced = true;
    const caption = document.getElementById("demo-caption");
    if (!caption) return;
    const line = s.verdict.correct
      ? "That is the whole idea. WebMCP lets a page work with an agent and still keep something from it — " +
        "in a way that does not depend on the model's cooperation."
      : "Wrong, and the page says so without giving anything away. The evidence is kept; you can go back to it.";
    caption.classList.remove("prompt");
    caption.textContent = line;
    await speak(line);
  });
}
