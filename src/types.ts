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
	graveyard: CardInstance[];
}

/** Placeholder: the stack exists so priority rules are right, but nothing uses it yet. */
export interface StackItem {
	id: string;
	description: string;
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
 */
export interface PendingAction {
	playerId: PlayerId;
	candidateId: string;
	label: string;
	selections: Selection[];
}

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

	priorityPlayerId: PlayerId;
	/** Players who have passed in a row. Phase ends when everyone has. */
	consecutivePasses: number;
	stack: StackItem[];

	/** Exactly two players. p1 takes the first turn. */
	players: Record<PlayerId, PlayerState>;
	/** The shared deck. Index 0 is the top card. */
	library: CardInstance[];

	pending: PendingAction | null;
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
