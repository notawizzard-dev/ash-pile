import type { ManaPool } from "./mana";
import type { Phase } from "./phases";
import type {
	ActionPrompt,
	CardInstance,
	GameResult,
	PendingContext,
	Permanent,
	PlayerId,
	ResolutionContext,
	StackItem,
} from "./types";

/**
 * What a client sees of the game, from one player's seat. Everything here is
 * a fresh copy built from the engine's state, and nothing that a player is not
 * allowed to know is present at all (as opposed to being present but blanked).
 *
 * Hidden by construction: the library's order and contents, the opponent's
 * hand, the RNG seed and state, and the opponent's pending decision.
 */

/** What anyone at the table can see about a player. */
export interface PublicPlayerView {
	id: PlayerId;
	name: string;
	/** Hands are hidden; only their size is public. */
	handSize: number;
	battlefield: Permanent[];
	/** Floating mana is public. */
	manaPool: ManaPool;
}

/**
 * Public projection of the engine's `ResolutionContext`. It deliberately omits
 * the step cursor and any private memo the engine keeps while resolving.
 */
export interface ResolutionView {
	kind: ResolutionContext["kind"];
	stackItemId: string;
	/** The player making the event's decisions. */
	controllerId: PlayerId;
}

/**
 * What the viewer is being asked. Only the player the game is waiting on gets
 * the options; the other player is told who is deciding and nothing more.
 */
export type ViewPrompt =
	| ActionPrompt
	| { kind: "waiting"; onPlayerId: PlayerId };

export interface GameView {
	viewerId: PlayerId;

	status: "active" | "finished";
	result: GameResult | null;

	turnNumber: number;
	activePlayerId: PlayerId;
	phase: Phase;
	landsPlayedThisTurn: number;

	/** Null while an event is resolving. */
	priorityPlayerId: PlayerId | null;
	consecutivePasses: number;
	stack: StackItem[];

	/** The viewer's own hand, in full. The opponent's is only a size in `players`. */
	hand: CardInstance[];
	players: Record<PlayerId, PublicPlayerView>;
	/** The shared library is face down: only its size is visible. */
	librarySize: number;
	/** The shared graveyard is public, in order. Index 0 is the top card. */
	graveyard: CardInstance[];

	/** The viewer's own decision in progress. Never the opponent's. */
	pendingCtx: PendingContext | null;
	/** The event currently resolving, if any. */
	resolutionCtx: ResolutionView | null;

	prompt: ViewPrompt;
	log: string[];
}
