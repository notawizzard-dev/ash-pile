import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ActionCandidate, ActionDefinition } from "../src/actions/action";
import { GameEngine } from "../src/engine";
import { opponentOf } from "../src/players";
import type {
	ActionPrompt,
	DeepReadonly,
	GameState,
	InputResult,
	PlayerId,
} from "../src/types";
import { thaw } from "../src/util";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function must<T>(value: T | undefined | null): T {
	assert.ok(value !== undefined && value !== null);
	return value;
}

const P1 = "p1";
const P2 = "p2";

function prompt(engine: GameEngine): DeepReadonly<ActionPrompt> {
	return engine.getLegalActions();
}

function optionIds(engine: GameEngine): string[] {
	const p = prompt(engine);
	assert.ok(
		p.kind === "chooseAction" || p.kind === "chooseParameter",
		`unexpected ${p.kind}`,
	);
	return p.options.map((o) => o.id);
}

function ok(result: InputResult): void {
	assert.equal(result.ok, true, result.ok ? "" : result.error);
}

function holder(engine: GameEngine): PlayerId {
	const p = prompt(engine);
	assert.ok(p.kind !== "gameOver", "the game is over");
	return p.playerId;
}

function select(engine: GameEngine, optionId: string): InputResult {
	return engine.submitInput({
		type: "select",
		playerId: holder(engine),
		optionId,
	});
}

function confirm(engine: GameEngine): InputResult {
	return engine.submitInput({ type: "confirm", playerId: holder(engine) });
}

function back(engine: GameEngine): InputResult {
	return engine.submitInput({ type: "back", playerId: holder(engine) });
}

function pass(engine: GameEngine): void {
	ok(select(engine, "pass-priority"));
	ok(confirm(engine));
}

/** Both players pass, ending the current phase. */
function passPhase(engine: GameEngine): void {
	pass(engine);
	pass(engine);
}

function advanceTo(engine: GameEngine, phase: string): void {
	for (let i = 0; i < 40 && engine.getState().phase !== phase; i++)
		passPhase(engine);
	assert.equal(engine.getState().phase, phase);
}

function count(
	cards: readonly { readonly name: string }[],
	name: string,
): number {
	return cards.filter((c) => c.name === name).length;
}

function landOptionId(engine: GameEngine): string {
	return must(optionIds(engine).find((id) => id.startsWith("play-land:")));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe("setup", () => {
	it("deals seven cards each from a shared 50-card deck of basic lands", () => {
		const state = new GameEngine({ seed: 1 }).getState();
		const { p1, p2 } = state.players;
		assert.equal(p1.hand.length, 7);
		assert.equal(p2.hand.length, 7);
		assert.equal(state.library.length, 50 - 14);

		const all = [...p1.hand, ...p2.hand, ...state.library];
		for (const land of ["Plains", "Island", "Swamp", "Mountain", "Forest"]) {
			assert.equal(count(all, land), 10, land);
		}
		assert.equal(new Set(all.map((c) => c.id)).size, 50, "card ids are unique");
	});

	it("is reproducible from a seed, and differs between seeds", () => {
		const order = (seed: number) =>
			new GameEngine({ seed }).getState().library.map((c) => c.id);
		assert.deepEqual(order(7), order(7));
		assert.notDeepEqual(order(7), order(8));
	});

	it("starts on the first player, in upkeep, having skipped untap automatically", () => {
		const state = new GameEngine({ seed: 1 }).getState();
		assert.equal(state.status, "active");
		assert.equal(state.turnNumber, 1);
		assert.equal(state.activePlayerId, P1);
		assert.equal(state.priorityPlayerId, P1);
		assert.equal(state.phase, "upkeep");
	});
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe("immutability", () => {
	it("hands out frozen deep copies of state and legal actions", () => {
		const engine = new GameEngine({ seed: 1 });
		const state = engine.getState();
		assert.notEqual(engine.getState(), state, "each call returns a fresh copy");

		assert.throws(() => {
			(state as GameState).turnNumber = 99;
		}, TypeError);
		assert.throws(() => {
			(state.players.p1 as GameState["players"]["p1"]).hand.pop();
		}, TypeError);
		assert.throws(() => {
			(state.library as GameState["library"]).length = 0;
		}, TypeError);

		const actions = engine.getLegalActions();
		assert.ok(actions.kind === "chooseAction");
		assert.throws(() => {
			(actions.options as { id: string; label: string }[]).push({
				id: "cheat",
				label: "cheat",
			});
		}, TypeError);

		assert.equal(engine.getState().turnNumber, 1, "engine state is unaffected");
	});

	it("does not alias the pending action into what it returns", () => {
		const engine = new GameEngine({ seed: 1 });
		select(engine, "pass-priority");
		const before = engine.getState();
		assert.equal(before.pending?.candidateId, "pass-priority");
		confirm(engine);
		assert.equal(
			before.pending?.candidateId,
			"pass-priority",
			"old snapshot is a stable copy",
		);
		assert.equal(engine.getState().pending, null);
	});
});

// ---------------------------------------------------------------------------
// Priority and phases
// ---------------------------------------------------------------------------

describe("priority and phases", () => {
	it('only offers "pass priority" outside main phases', () => {
		const engine = new GameEngine({ seed: 1 });
		assert.deepEqual(optionIds(engine), ["pass-priority"]);
	});

	it("needs both players to pass before the phase advances", () => {
		const engine = new GameEngine({ seed: 1 });
		pass(engine);
		assert.equal(engine.getState().phase, "upkeep");
		assert.equal(engine.getState().priorityPlayerId, P2);
		pass(engine);
		assert.equal(engine.getState().phase, "draw");
		assert.equal(
			engine.getState().priorityPlayerId,
			P1,
			"active player gets priority first",
		);
	});

	it("skips the first player's draw on turn 1, then reaches main 1", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");
		const state = engine.getState();
		assert.equal(state.players.p1.hand.length, 7);
		assert.equal(state.library.length, 36);
	});

	it("rolls over to the next player, who draws and gets a fresh land drop", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");
		ok(select(engine, landOptionId(engine)));
		ok(confirm(engine));
		assert.equal(engine.getState().landsPlayedThisTurn, 1);

		advanceTo(engine, "end");
		passPhase(engine);

		let state = engine.getState();
		assert.equal(state.turnNumber, 2);
		assert.equal(state.activePlayerId, P2);
		assert.equal(state.phase, "upkeep");
		assert.equal(state.landsPlayedThisTurn, 0);

		advanceTo(engine, "main1");
		state = engine.getState();
		assert.equal(state.players.p2.hand.length, 8, "drew for the turn");
		assert.equal(state.library.length, 35);
		assert.ok(optionIds(engine).some((id) => id.startsWith("play-land:")));
	});
});

// ---------------------------------------------------------------------------
// Playing a land (select -> confirm)
// ---------------------------------------------------------------------------

describe("playing a land", () => {
	it("walks select -> confirm and then mutates the game state", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");

		const id = landOptionId(engine);
		ok(select(engine, id));

		// The option being considered is part of the state; nothing has changed yet.
		const considering = engine.getState();
		assert.equal(considering.pending?.candidateId, id);
		assert.equal(considering.players.p1.hand.length, 7);
		assert.equal(considering.players.p1.battlefield.length, 0);
		assert.equal(prompt(engine).kind, "confirm");

		ok(confirm(engine));
		const after = engine.getState();
		assert.equal(after.pending, null);
		assert.equal(after.players.p1.hand.length, 6);
		assert.equal(after.players.p1.battlefield.length, 1);
		assert.equal(after.landsPlayedThisTurn, 1);
		assert.equal(
			after.priorityPlayerId,
			P1,
			"the player keeps priority after a special action",
		);
	});

	it("stops offering lands once the land drop is used", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");
		ok(select(engine, landOptionId(engine)));
		ok(confirm(engine));
		assert.deepEqual(optionIds(engine), ["pass-priority"]);
	});

	it("collapses identical lands in hand into one option", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");
		const hand = engine.getState().players.p1.hand;
		const distinctNames = new Set(hand.map((c) => c.name)).size;
		const landOptions = optionIds(engine).filter((id) =>
			id.startsWith("play-land:"),
		);
		assert.equal(landOptions.length, distinctNames);
	});

	it("does not offer lands to the non-active player in main 1", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");
		pass(engine); // active player passes; opponent now holds priority
		assert.equal(holder(engine), P2);
		assert.deepEqual(optionIds(engine), ["pass-priority"]);
	});
});

// ---------------------------------------------------------------------------
// Back / cancel and rejected input
// ---------------------------------------------------------------------------

describe("back and invalid input", () => {
	it("lets the player back out of a selection and of a confirm prompt", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");
		ok(select(engine, landOptionId(engine)));
		assert.equal(prompt(engine).kind, "confirm");
		ok(back(engine));
		assert.equal(prompt(engine).kind, "chooseAction");
		assert.equal(engine.getState().pending, null);
	});

	it("rejects bad input and leaves the state exactly as it was", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");
		const snapshot = JSON.stringify(engine.getState());

		const attempts: InputResult[] = [
			engine.submitInput({
				type: "select",
				playerId: P2,
				optionId: "pass-priority",
			}), // wrong player
			engine.submitInput({
				type: "select",
				playerId: P1,
				optionId: "nonsense",
			}), // not an option
			engine.submitInput({ type: "confirm", playerId: P1 }), // nothing to confirm
			engine.submitInput({ type: "back", playerId: P1 }), // nothing to back out of
		];
		for (const result of attempts) assert.equal(result.ok, false);
		assert.equal(JSON.stringify(engine.getState()), snapshot);
	});

	it("refuses a second select while waiting for confirmation", () => {
		const engine = new GameEngine({ seed: 1 });
		select(engine, "pass-priority");
		assert.equal(select(engine, "pass-priority").ok, false);
	});
});

// ---------------------------------------------------------------------------
// Nested parameter selection (stand-in spell with two targets, like Bite Down)
// ---------------------------------------------------------------------------

/** Not part of the game: exists only to exercise multi-step actions. */
class FakeBiteDown implements ActionDefinition {
	candidates(
		state: DeepReadonly<GameState>,
		playerId: PlayerId,
	): ActionCandidate[] {
		if (state.activePlayerId !== playerId || state.phase !== "main1") return [];
		const mine = state.players[playerId].battlefield;
		const theirs = state.players[opponentOf(playerId)].battlefield;
		if (mine.length === 0 || theirs.length === 0) return [];

		return [
			{
				id: "cast:bite-down",
				label: "Cast Bite Down",
				steps: [
					{
						name: "source",
						prompt: "Choose a permanent you control",
						options: () =>
							mine.map((p) => ({ id: p.card.id, label: p.card.name })),
					},
					{
						name: "target",
						prompt: "Choose a permanent you don't control",
						options: () =>
							theirs.map((p) => ({ id: p.card.id, label: p.card.name })),
					},
				],
				summarize: (sel) => `Bite Down: ${sel[0]?.label} -> ${sel[1]?.label}`,
				execute: (draft, sel) => {
					draft.log.push(
						`Bite Down resolves: ${sel[0]?.optionId} -> ${sel[1]?.optionId}`,
					);
				},
			},
		];
	}
}

/** Always blows up mid-execution, after already mutating the draft. */
class FakeExplode implements ActionDefinition {
	candidates(): ActionCandidate[] {
		return [
			{
				id: "explode",
				label: "Explode",
				steps: [],
				summarize: () => "This will fail",
				execute: (draft) => {
					draft.turnNumber = 999;
					draft.players.p1.hand.length = 0;
					throw new Error("boom");
				},
			},
		];
	}
}

function scenario(extra: ActionDefinition[]): GameEngine {
	const base = thaw<GameState>(new GameEngine({ seed: 1 }).getState());
	base.phase = "main1";
	base.players.p1.battlefield.push({
		card: { id: "mountain-a", name: "Mountain" },
		controllerId: P1,
		tapped: false,
	});
	base.players.p2.battlefield.push({
		card: { id: "island-b", name: "Island" },
		controllerId: P2,
		tapped: false,
	});
	return GameEngine.fromState(base, { extraActions: extra });
}

describe("nested parameter selection", () => {
	it("asks for the spell, then each parameter one at a time, then confirms", () => {
		const engine = scenario([new FakeBiteDown()]);

		// Top level lists the spell once (alongside land plays and pass), not once per target.
		const top = optionIds(engine);
		assert.deepEqual(
			top.filter((id) => id.startsWith("cast:")),
			["cast:bite-down"],
		);
		assert.ok(top.includes("pass-priority"));
		assert.ok(top.some((id) => id.startsWith("play-land:")));

		ok(select(engine, "cast:bite-down"));
		let p = prompt(engine);
		assert.ok(p.kind === "chooseParameter");
		assert.equal(p.parameter, "source");
		assert.deepEqual(
			p.options.map((o) => o.id),
			["mountain-a"],
		);
		assert.equal(engine.getState().pending?.label, "Cast Bite Down");

		ok(select(engine, "mountain-a"));
		p = prompt(engine);
		assert.ok(p.kind === "chooseParameter");
		assert.equal(p.parameter, "target");
		assert.deepEqual(
			p.options.map((o) => o.id),
			["island-b"],
		);
		assert.deepEqual(
			p.selections.map((s) => s.optionId),
			["mountain-a"],
		);

		ok(select(engine, "island-b"));
		p = prompt(engine);
		assert.ok(p.kind === "confirm");
		assert.equal(p.summary, "Bite Down: Mountain -> Island");
		assert.equal(
			engine.getState().log.some((l) => l.startsWith("Bite Down resolves")),
			false,
			"nothing applied before confirm",
		);

		ok(confirm(engine));
		assert.ok(
			engine
				.getState()
				.log.includes("Bite Down resolves: mountain-a -> island-b"),
		);
		assert.equal(engine.getState().pending, null);
		assert.equal(prompt(engine).kind, "chooseAction");
	});

	it("steps back one parameter at a time", () => {
		const engine = scenario([new FakeBiteDown()]);
		ok(select(engine, "cast:bite-down"));
		ok(select(engine, "mountain-a"));
		assert.equal(
			(prompt(engine) as { parameter?: string }).parameter,
			"target",
		);

		ok(back(engine));
		assert.equal(
			(prompt(engine) as { parameter?: string }).parameter,
			"source",
		);
		ok(back(engine));
		assert.equal(prompt(engine).kind, "chooseAction");
		assert.equal(engine.getState().pending, null);
	});

	it("rejects an option that belongs to a different step", () => {
		const engine = scenario([new FakeBiteDown()]);
		ok(select(engine, "cast:bite-down"));
		assert.equal(
			select(engine, "island-b").ok,
			false,
			"island-b is a target, not a source",
		);
		assert.equal(
			(prompt(engine) as { parameter?: string }).parameter,
			"source",
		);
	});

	it("does not offer the spell when no legal choices exist", () => {
		const engine = new GameEngine({
			seed: 1,
			extraActions: [new FakeBiteDown()],
		});
		advanceTo(engine, "main1");
		assert.ok(!optionIds(engine).includes("cast:bite-down"));
	});
});

// ---------------------------------------------------------------------------
// Atomicity
// ---------------------------------------------------------------------------

describe("atomic updates", () => {
	it("discards every change if an action throws partway through", () => {
		const engine = scenario([new FakeExplode()]);
		ok(select(engine, "explode"));
		const snapshot = JSON.stringify(engine.getState());

		assert.throws(() => confirm(engine), /boom/);
		assert.equal(JSON.stringify(engine.getState()), snapshot);
		assert.equal(
			engine.getState().pending?.candidateId,
			"explode",
			"still awaiting confirm",
		);
	});
});

// ---------------------------------------------------------------------------
// Game end
// ---------------------------------------------------------------------------

describe("game end", () => {
	it("ends the game when a player must draw from the empty shared library", () => {
		const base = thaw<GameState>(new GameEngine({ seed: 1 }).getState());
		base.turnNumber = 2; // so the active player draws this turn
		base.library = [];
		const engine = GameEngine.fromState(base);

		passPhase(engine); // upkeep -> draw: attempts to draw, loses

		const state = engine.getState();
		assert.equal(state.status, "finished");
		assert.equal(state.result?.loserId, P1);
		assert.equal(prompt(engine).kind, "gameOver");
		assert.equal(
			engine.submitInput({
				type: "select",
				playerId: P1,
				optionId: "pass-priority",
			}).ok,
			false,
		);
	});
});
