import type { ManaPool } from "./mana";
import type { Phase } from "./phases";
import type { PlayerId } from "./players";

export type { PlayerId };
export type CardId = string;

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

/** A single physical card. Rules text lives in the card registry, keyed by name. */
export interface CardInstance {
	id: CardId;
	name: string;
}

export interface Permanent {
	card: CardInstance;
	controllerId: PlayerId;
	tapped: boolean;
}

export interface PlayerState {
	id: PlayerId;
	name: string;
	hand: CardInstance[];
	battlefield: Permanent[];
	/** Floating mana. Empties at the end of every step and phase. */
	manaPool: ManaPool;
}

/** A spell on the stack. Abilities will join it as another `kind` later. */
export interface StackItem {
	id: string;
	kind: "spell";
	/** The card being cast. It is on the stack, not in any other zone, until it resolves. */
	card: CardInstance;
	controllerId: PlayerId;
}

/** One answer the player has given while building up an action. */
export interface Selection {
	/** Name of the parameter step this answered (e.g. "target"). */
	step: string;
	optionId: string;
	/** Human-readable label, kept so the state is self-describing. */
	label: string;
}

/**
 * The action a player is currently "considering": picked from the top-level
 * list, possibly with some parameters filled in, but not yet confirmed.
 * Cancelable (`back`), and visible only to its owner.
 */
export interface PendingContext {
	playerId: PlayerId;
	candidateId: string;
	label: string;
	selections: Selection[];
}

/**
 * A committed event that is part-way through resolving, e.g. a spell whose
 * effect needs a decision from its controller. Unlike `PendingContext` it
 * cannot be cancelled. Plain data only (no closures or generators) so the
 * state stays clonable and serializable; the card registry holds the logic and
 * this holds only the cursor. Prefer deriving facts from the rest of the state
 * over storing them here.
 *
 * Discriminated by `kind` so other event types can be added later.
 */
export type ResolutionContext = {
	kind: "spell";
	/** The stack item being resolved. */
	stackItemId: string;
	/** The player who makes this event's decisions. */
	controllerId: PlayerId;
	/** Index of the next resolution step to run. */
	step: number;
};

export interface GameResult {
	loserId: PlayerId;
	reason: string;
}

export interface GameState {
	status: "active" | "finished";
	result: GameResult | null;

	/** Seed the game started with, kept so a game can be reproduced. */
	seed: number;
	/** Live RNG state; lives in the state so all randomness is reproducible. */
	rngState: number;

	turnNumber: number;
	activePlayerId: PlayerId;
	phase: Phase;
	landsPlayedThisTurn: number;

	/** Null while an event is resolving: nobody holds priority then. */
	priorityPlayerId: PlayerId | null;
	/** Players who have passed in a row. Phase ends when everyone has. */
	consecutivePasses: number;
	/** Index 0 is the top of the stack (the next to resolve), as in the library. */
	stack: StackItem[];

	/** Exactly two players. p1 takes the first turn. */
	players: Record<PlayerId, PlayerState>;
	/** The shared deck. Index 0 is the top card. */
	library: CardInstance[];
	/** The shared graveyard. Order matters. Index 0 is the top card, as in the library. */
	graveyard: CardInstance[];

	/** The decision being built up by the player who is deciding. */
	pendingCtx: PendingContext | null;
	/** The event currently resolving, if any. */
	resolutionCtx: ResolutionContext | null;
	log: string[];
}

export type DeepReadonly<T> = T extends readonly (infer U)[]
	? ReadonlyArray<DeepReadonly<U>>
	: T extends object
		? { readonly [K in keyof T]: DeepReadonly<T[K]> }
		: T;

// ---------------------------------------------------------------------------
// Legal actions (what the engine asks the player next)
// ---------------------------------------------------------------------------

export interface Choice {
	id: string;
	label: string;
}

export type ActionPrompt =
	/** Top level: which action do you want to consider? */
	| {
			kind: "chooseAction";
			playerId: PlayerId;
			prompt: string;
			options: Choice[];
	  }
	/** One parameter of the action under consideration, e.g. its target. */
	| {
			kind: "chooseParameter";
			playerId: PlayerId;
			actionLabel: string;
			parameter: string;
			prompt: string;
			options: Choice[];
			selections: Selection[];
	  }
	/** Nothing further to choose: confirm to apply it, or go back. */
	| {
			kind: "confirm";
			playerId: PlayerId;
			actionLabel: string;
			summary: string;
			selections: Selection[];
	  }
	| { kind: "gameOver"; result: GameResult };

// ---------------------------------------------------------------------------
// Player input
// ---------------------------------------------------------------------------

export type PlayerInput =
	/** Pick one of the options in the current prompt. */
	| { type: "select"; playerId: PlayerId; optionId: string }
	/** Apply the action shown in a `confirm` prompt. */
	| { type: "confirm"; playerId: PlayerId }
	/** Undo the most recent selection (or abandon the action if none). */
	| { type: "back"; playerId: PlayerId };

export type InputResult =
	| {
			ok: true /** Log lines produced by this input (empty for select/back). */;
			log: string[];
	  }
	| { ok: false; error: string };
