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

const RATE = 0.98;

function pickVoice() {
  const en = speechSynthesis.getVoices().filter((v) => /^en(-|_)?/i.test(v.lang));
  return en.find((v) => /natural|google|zira|aria/i.test(v.name)) || en[0] || null;
}

/**
 * Speak one sentence.
 *
 * Chrome stops speaking after roughly fifteen seconds and fires neither `end`
 * nor `error`, which hangs anything awaiting it — so this does two things the
 * plain API does not: a pause/resume keep-alive while it runs, and a ceiling
 * derived from the word count so a swallowed utterance cannot stall the
 * walkthrough. Callers pass one sentence at a time, which keeps most
 * utterances under the limit in the first place.
 */
function speakOne(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve(false);

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = RATE;
    u.voice = pickVoice();

    const words = text.trim().split(/\s+/).length;
    const ceiling = (words / (2.6 * RATE)) * 1000 + 4000;

    let done = false;
    const keepAlive = setInterval(() => {
      if (speechSynthesis.speaking) {
        speechSynthesis.pause();
        speechSynthesis.resume();
      }
    }, 8000);

    const finish = (ok) => {
      if (done) return;
      done = true;
      clearInterval(keepAlive);
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      speechSynthesis.cancel();
      finish(false);
    }, ceiling);

    u.onend = () => finish(true);
    u.onerror = () => finish(false);
    speechSynthesis.speak(u);
  });
}

/** Split on sentence boundaries so no single utterance runs long. */
async function speak(text) {
  const ready = speechSynthesis.getVoices().length
    ? Promise.resolve()
    : new Promise((r) =>
        speechSynthesis.addEventListener("voiceschanged", r, { once: true }),
      );
  await Promise.race([ready, pause(1500)]);

  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|.+$/g) || [text];
  for (const s of sentences) {
    if (s.trim()) await speakOne(s.trim());
  }
  return true;
}

/**
 * Call a tool the way an agent would.
 *
 * `executeTool` in Chrome 151 intermittently rejects with
 * "UnknownError: The operation failed for an unknown transient reason", so
 * this retries once before giving up. If WebMCP is unavailable — or a call
 * fails twice — it drives the same engine method directly and marks the step,
 * rather than stalling the walkthrough or pretending the tool ran.
 */
function makeCaller(engine) {
  const viaWebMCP = "modelContext" in document;

  const direct = {
    read_case_file: () => engine.caseFile(),
    begin_investigation: () => engine.beginInvestigation(),
    examine: (a) => engine.examine(a.object_id),
    interview: (a) => engine.interview(a.suspect_id, a.topic),
    propose_accusation: (a) => engine.proposeAccusation(a),
  };

  const fallback = (name, args) => {
    const fn = direct[name];
    return fn ? fn(args || {}) : { skipped: name };
  };

  if (!viaWebMCP) {
    return { viaWebMCP, async call(name, args) { return fallback(name, args); } };
  }

  return {
    viaWebMCP,
    async call(name, args) {
      const mc = document.modelContext;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const tool = (await mc.getTools()).find((t) => t.name === name);
          if (!tool) return fallback(name, args);
          // Chrome takes the arguments as a JSON string, not an object.
          return await mc.executeTool(tool, JSON.stringify(args || {}));
        } catch (e) {
          if (attempt === 0) {
            await pause(400);
            continue;
          }
          console.warn(`[demo] ${name} failed through WebMCP, driving the engine:`, e);
          return fallback(name, args);
        }
      }
    },
  };
}

/**
 * Chrome will not speak without a user gesture: `speak()` resolves silently and
 * the walkthrough runs mute. So the demo opens behind a button, which also
 * gives whoever is recording a clean frame to start on.
 */
function waitForStart() {
  return new Promise((resolve) => {
    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };

    const veil = document.createElement("div");
    veil.id = "demo-veil";
    const card = el("div", "demo-veil-card");
    card.append(el("p", "demo-veil-kicker", "Narrated walkthrough"));
    card.append(el("h2", null, "Sealed Case"));
    card.append(
      el(
        "p",
        "demo-veil-body",
        "Two and a half minutes. The steps below are real WebMCP tool calls against this page, " +
          "and it stops where the agent has to — at a button only you can press.",
      ),
    );
    const start = el("button", "act primary", "Begin the walkthrough");
    start.id = "demo-start";
    card.append(start);
    card.append(el("p", "demo-veil-note", "Sound on."));
    veil.append(card);
    document.body.append(veil);

    start.addEventListener("click", () => {
      // warm the speech engine inside the gesture, or the first line is eaten
      try {
        speechSynthesis.cancel();
        speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
      } catch {}
      veil.classList.add("gone");
      setTimeout(() => veil.remove(), 400);
      resolve();
    });
  });
}

export async function runDemo(engine) {
  await waitForStart();
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
    if (step.do) {
      try {
        await step.do(caller.call);
      } catch (e) {
        // one broken step must not strand the rest of the walkthrough
        console.warn("[demo] step failed:", e);
      }
    }
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
