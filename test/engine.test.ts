import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ActionCandidate, ActionDefinition } from "../src/actions/action";
import { GameEngine } from "../src/engine";
import { opponentOf } from "../src/players";
import type {
	DeepReadonly,
	GameState,
	InputResult,
	PlayerId,
} from "../src/types";
import { decidingPlayerId } from "../src/util";
import type { ViewPrompt } from "../src/view";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function must<T>(value: T | undefined | null): T {
	assert.ok(value !== undefined && value !== null);
	return value;
}

const P1 = "p1";
const P2 = "p2";

/** The prompt as seen by `viewer`, defaulting to whoever the game is waiting on. */
function prompt(engine: GameEngine, viewer?: PlayerId): ViewPrompt {
	return engine.getView(viewer ?? decidingPlayerId(engine.exportState()))
		.prompt;
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

/** Whoever the game is currently waiting on. */
function holder(engine: GameEngine): PlayerId {
	const state = engine.exportState();
	assert.equal(state.status, "active", "the game is over");
	return decidingPlayerId(state);
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
	for (let i = 0; i < 40 && engine.exportState().phase !== phase; i++) {
		passPhase(engine);
	}
	assert.equal(engine.exportState().phase, phase);
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
		const state = new GameEngine({ seed: 1 }).exportState();
		const { p1, p2 } = state.players;
		assert.equal(p1.hand.length, 7);
		assert.equal(p2.hand.length, 7);
		assert.equal(state.library.length, 50 - 14);
		assert.deepEqual(state.graveyard, []);

		const all = [...p1.hand, ...p2.hand, ...state.library];
		for (const land of ["Plains", "Island", "Swamp", "Mountain", "Forest"]) {
			assert.equal(count(all, land), 10, land);
		}
		assert.equal(new Set(all.map((c) => c.id)).size, 50, "card ids are unique");
	});

	it("is reproducible from a seed, and differs between seeds", () => {
		const order = (seed: number) =>
			new GameEngine({ seed }).exportState().library.map((c) => c.id);
		assert.deepEqual(order(7), order(7));
		assert.notDeepEqual(order(7), order(8));
	});

	it("starts on the first player, in upkeep, having skipped untap automatically", () => {
		const state = new GameEngine({ seed: 1 }).exportState();
		assert.equal(state.status, "active");
		assert.equal(state.turnNumber, 1);
		assert.equal(state.activePlayerId, P1);
		assert.equal(state.priorityPlayerId, P1);
		assert.equal(state.phase, "upkeep");
		assert.equal(state.pendingCtx, null);
		assert.equal(state.resolutionCtx, null);
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
		assert.equal(engine.exportState().phase, "upkeep");
		assert.equal(engine.exportState().priorityPlayerId, P2);
		pass(engine);
		assert.equal(engine.exportState().phase, "draw");
		assert.equal(
			engine.exportState().priorityPlayerId,
			P1,
			"active player gets priority first",
		);
	});

	it("skips the first player's draw on turn 1, then reaches main 1", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");
		const state = engine.exportState();
		assert.equal(state.players.p1.hand.length, 7);
		assert.equal(state.library.length, 36);
	});

	it("rolls over to the next player, who draws and gets a fresh land drop", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");
		ok(select(engine, landOptionId(engine)));
		ok(confirm(engine));
		assert.equal(engine.exportState().landsPlayedThisTurn, 1);

		advanceTo(engine, "end");
		passPhase(engine);

		let state = engine.exportState();
		assert.equal(state.turnNumber, 2);
		assert.equal(state.activePlayerId, P2);
		assert.equal(state.phase, "upkeep");
		assert.equal(state.landsPlayedThisTurn, 0);

		advanceTo(engine, "main1");
		state = engine.exportState();
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
		const considering = engine.exportState();
		assert.equal(considering.pendingCtx?.candidateId, id);
		assert.equal(considering.players.p1.hand.length, 7);
		assert.equal(considering.players.p1.battlefield.length, 0);
		assert.equal(prompt(engine).kind, "confirm");

		ok(confirm(engine));
		const after = engine.exportState();
		assert.equal(after.pendingCtx, null);
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
		const hand = engine.exportState().players.p1.hand;
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
		assert.equal(engine.exportState().pendingCtx, null);
	});

	it("rejects bad input and leaves the state exactly as it was", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");
		const snapshot = JSON.stringify(engine.exportState());

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
		for (const result of attempts) {
			assert.equal(result.ok, false);
		}
		assert.equal(JSON.stringify(engine.exportState()), snapshot);
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
		if (state.activePlayerId !== playerId || state.phase !== "main1") {
			return [];
		}
		const mine = state.players[playerId].battlefield;
		const theirs = state.players[opponentOf(playerId)].battlefield;
		if (mine.length === 0 || theirs.length === 0) {
			return [];
		}

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

/**
 * A game in the first main phase with a Mountain (p1) and an Island (p2) on
 * the battlefield. `tweak` can adjust the state further before the engine is
 * built from it.
 */
function scenario(
	extra: ActionDefinition[],
	tweak?: (state: GameState) => void,
): GameEngine {
	const base = new GameEngine({ seed: 1 }).exportState();
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
	tweak?.(base);
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
		assert.equal(engine.exportState().pendingCtx?.label, "Cast Bite Down");

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
			engine.exportState().log.some((l) => l.startsWith("Bite Down resolves")),
			false,
			"nothing applied before confirm",
		);

		ok(confirm(engine));
		assert.ok(
			engine
				.exportState()
				.log.includes("Bite Down resolves: mountain-a -> island-b"),
		);
		assert.equal(engine.exportState().pendingCtx, null);
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
		assert.equal(engine.exportState().pendingCtx, null);
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
		const snapshot = JSON.stringify(engine.exportState());

		assert.throws(() => confirm(engine), /boom/);
		assert.equal(JSON.stringify(engine.exportState()), snapshot);
		assert.equal(
			engine.exportState().pendingCtx?.candidateId,
			"explode",
			"still awaiting confirm",
		);
	});
});

// ---------------------------------------------------------------------------
// Player views (what each seat is allowed to see)
// ---------------------------------------------------------------------------

describe("player views", () => {
	it("shows the viewer their own hand and the opponent's hand only as a size", () => {
		const engine = new GameEngine({ seed: 1 });
		const state = engine.exportState();
		const v1 = engine.getView(P1);
		const v2 = engine.getView(P2);

		assert.equal(v1.viewerId, P1);
		assert.equal(v2.viewerId, P2);
		assert.deepEqual(v1.hand, state.players.p1.hand);
		assert.deepEqual(v2.hand, state.players.p2.hand);
		assert.equal(v1.players.p2.handSize, 7);
		assert.equal(v2.players.p1.handSize, 7);
		assert.equal("hand" in v1.players.p2, false);
		assert.equal("hand" in v2.players.p1, false);
	});

	it("shows only the size of the library, and leaves out the seed and RNG state", () => {
		const view = new GameEngine({ seed: 1 }).getView(P1);
		assert.equal(view.librarySize, 36);
		for (const key of ["library", "seed", "rngState"]) {
			assert.equal(key in view, false, `"${key}" must not be in a view`);
		}
	});

	it("leaks no hidden card identity or seed anywhere in the serialized view", () => {
		const seed = 123456789;
		const engine = new GameEngine({ seed });
		const state = engine.exportState();
		const json = JSON.stringify(engine.getView(P2));

		// Sanity: the check can fail. P2's own hand is visible to P2.
		for (const card of state.players.p2.hand) {
			assert.ok(json.includes(JSON.stringify(card.id)), `own card ${card.id}`);
		}
		// P1's hand and the whole library are hidden from P2, by id.
		for (const card of [...state.players.p1.hand, ...state.library]) {
			assert.equal(
				json.includes(JSON.stringify(card.id)),
				false,
				`${card.id} leaked`,
			);
		}
		// The seed (and RNG state) would reveal the library order, log included.
		assert.equal(json.includes(String(seed)), false, "seed leaked");
		assert.equal(json.includes(String(state.rngState)), false, "rng leaked");
	});

	it("keeps public information identical between the two seats", () => {
		const engine = scenario([], (s) => {
			s.graveyard = [
				{ id: "swamp-1", name: "Swamp" },
				{ id: "island-1", name: "Island" },
				{ id: "plains-1", name: "Plains" },
			];
			s.stack = [{ id: "stack-1", description: "A spell" }];
		});
		const v1 = engine.getView(P1);
		const v2 = engine.getView(P2);

		assert.deepEqual(
			v1.graveyard.map((c) => c.id),
			["swamp-1", "island-1", "plains-1"],
			"the shared graveyard keeps its order",
		);
		assert.deepEqual(v1.graveyard, v2.graveyard);
		assert.deepEqual(v1.stack, v2.stack);
		assert.deepEqual(v1.players.p1.battlefield, v2.players.p1.battlefield);
		assert.deepEqual(v1.players.p2.battlefield, v2.players.p2.battlefield);
		assert.equal(v1.librarySize, v2.librarySize);
		assert.deepEqual(v1.log, v2.log);
		assert.equal(v1.phase, v2.phase);
		assert.equal(v1.turnNumber, v2.turnNumber);
		assert.equal(v1.hand.length, v2.players.p1.handSize);
		assert.equal(v2.hand.length, v1.players.p2.handSize);
	});

	it("gives the options to the deciding player and a waiting prompt to the other", () => {
		const engine = new GameEngine({ seed: 1 });
		assert.equal(engine.getView(P1).prompt.kind, "chooseAction");
		assert.deepEqual(engine.getView(P2).prompt, {
			kind: "waiting",
			onPlayerId: P1,
		});

		// P1 picks an option: P2 still learns nothing about it.
		select(engine, "pass-priority");
		assert.equal(engine.getView(P1).prompt.kind, "confirm");
		assert.deepEqual(engine.getView(P2).prompt, {
			kind: "waiting",
			onPlayerId: P1,
		});

		// After P1 passes, the roles swap.
		confirm(engine);
		assert.deepEqual(engine.getView(P1).prompt, {
			kind: "waiting",
			onPlayerId: P2,
		});
		assert.equal(engine.getView(P2).prompt.kind, "chooseAction");
	});

	it("shows the pending decision only to its owner", () => {
		const engine = new GameEngine({ seed: 1 });
		select(engine, "pass-priority");
		assert.equal(engine.getView(P1).pendingCtx?.candidateId, "pass-priority");
		assert.equal(engine.getView(P2).pendingCtx, null);
	});

	it("gives a stable snapshot of the pending decision", () => {
		const engine = new GameEngine({ seed: 1 });
		select(engine, "pass-priority");
		const before = engine.getView(P1);
		assert.equal(before.pendingCtx?.candidateId, "pass-priority");
		confirm(engine);
		assert.equal(
			before.pendingCtx?.candidateId,
			"pass-priority",
			"old view is unaffected",
		);
		assert.equal(engine.getView(P1).pendingCtx, null);
	});

	it("hands out copies: mutating a view or an export never touches the engine", () => {
		const engine = scenario([]);
		const viewBefore = JSON.stringify(engine.getView(P1));
		const stateBefore = JSON.stringify(engine.exportState());

		const view = engine.getView(P1);
		view.hand.pop();
		view.graveyard.push({ id: "x", name: "Swamp" });
		view.stack.push({ id: "s", description: "fake" });
		view.log.push("fake");
		view.players.p2.handSize = 0;
		must(view.players.p1.battlefield[0]).tapped = true;

		const exported = engine.exportState();
		exported.turnNumber = 99;
		exported.library.length = 0;
		must(exported.players.p1.battlefield[0]).tapped = true;

		assert.equal(JSON.stringify(engine.getView(P1)), viewBefore);
		assert.equal(JSON.stringify(engine.exportState()), stateBefore);
	});

	it("copies the state it is resumed from", () => {
		const base = new GameEngine({ seed: 1 }).exportState();
		const engine = GameEngine.fromState(base);
		base.turnNumber = 99;
		base.library.length = 0;
		assert.equal(engine.exportState().turnNumber, 1);
		assert.equal(engine.exportState().library.length, 36);
	});

	it("keeps state and views plain data that survives a JSON round trip", () => {
		const engine = new GameEngine({ seed: 1 });
		advanceTo(engine, "main1");
		ok(select(engine, landOptionId(engine)));
		ok(confirm(engine));
		select(engine, "pass-priority"); // leave a pending decision in the state

		const state = engine.exportState();
		assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
		for (const id of [P1, P2] as const) {
			const view = engine.getView(id);
			assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
		}
	});
});

// ---------------------------------------------------------------------------
// Resolution context (groundwork: nothing sets it yet, but the shape is in place)
// ---------------------------------------------------------------------------

describe("resolution context", () => {
	function resolvingScenario(controllerId: PlayerId = P2): GameEngine {
		return scenario([], (s) => {
			s.stack = [{ id: "s1", description: "A spell" }];
			s.priorityPlayerId = null;
			s.resolutionCtx = {
				kind: "spell",
				stackItemId: "s1",
				controllerId,
				step: 3,
			};
		});
	}

	it("asks the resolving player to decide, rather than the priority holder", () => {
		const engine = resolvingScenario();
		assert.equal(holder(engine), P2);
		assert.deepEqual(engine.getView(P1).prompt, {
			kind: "waiting",
			onPlayerId: P2,
		});
		assert.equal(engine.getView(P2).prompt.kind, "chooseAction");
	});

	it("offers no priority or land actions while an event is resolving", () => {
		// P1 is the active player in main 1 with lands in hand, so would normally
		// be offered a land drop and a pass.
		const engine = resolvingScenario(P1);
		const p = engine.getView(P1).prompt;
		assert.ok(p.kind === "chooseAction");
		assert.deepEqual(p.options, []);
	});

	it("shows both players a public projection of it, without the engine's cursor", () => {
		const engine = resolvingScenario();
		for (const id of [P1, P2] as const) {
			const view = engine.getView(id);
			assert.equal(view.priorityPlayerId, null);
			assert.deepEqual(view.resolutionCtx, {
				kind: "spell",
				stackItemId: "s1",
				controllerId: P2,
			});
		}
	});
});

// ---------------------------------------------------------------------------
// Game end
// ---------------------------------------------------------------------------

describe("game end", () => {
	it("ends the game when a player must draw from the empty shared library", () => {
		const base = new GameEngine({ seed: 1 }).exportState();
		base.turnNumber = 2; // so the active player draws this turn
		base.library = [];
		const engine = GameEngine.fromState(base);

		passPhase(engine); // upkeep -> draw: attempts to draw, loses

		const state = engine.exportState();
		assert.equal(state.status, "finished");
		assert.equal(state.result?.loserId, P1);
		assert.equal(prompt(engine).kind, "gameOver");
		assert.equal(engine.getView(P1).prompt.kind, "gameOver");
		assert.equal(engine.getView(P2).prompt.kind, "gameOver");
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
