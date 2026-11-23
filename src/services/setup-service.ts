import { BASIC_LAND_NAMES } from "../cards";
import { PLAYER_COUNT, PLAYER_IDS, type PlayerId } from "../players";
import { randomSeed } from "../rng";
import type { GameState, PlayerState } from "../types";
import { appendLog } from "../util";
import type { DeckService } from "./deck-service";
import type { TurnService } from "./turn-service";

export const OPENING_HAND_SIZE = 7;
export const DEFAULT_COPIES_PER_LAND = 10;

export interface SetupOptions {
	/** Exactly two players for now. */
	playerNames?: readonly [string, string];
	/** Same seed, same shuffle. Random if omitted. */
	seed?: number;
	copiesPerLand?: number;
}

function newPlayer(id: PlayerId, name: string): PlayerState {
	return { id, name, hand: [], battlefield: [] };
}

export class GameSetupService {
	constructor(
		private readonly deck: DeckService,
		private readonly turns: TurnService,
	) {}

	createInitialState(options: SetupOptions = {}): GameState {
		const seed = (options.seed ?? randomSeed()) >>> 0;
		const [name1, name2]: readonly [string, string] = options.playerNames ?? [
			"Player 1",
			"Player 2",
		];
		const copiesPerLand = options.copiesPerLand ?? DEFAULT_COPIES_PER_LAND;

		const players: Record<PlayerId, PlayerState> = {
			p1: newPlayer("p1", name1),
			p2: newPlayer("p2", name2),
		};
		const firstPlayerId: PlayerId = "p1";

		const needed = PLAYER_COUNT * OPENING_HAND_SIZE;
		const deckSize = copiesPerLand * BASIC_LAND_NAMES.length;
		if (deckSize < needed) {
			throw new Error(
				`Shared deck has ${deckSize} cards but opening hands need ${needed}`,
			);
		}

		const draft: GameState = {
			status: "active",
			result: null,
			seed,
			rngState: seed,
			turnNumber: 1,
			activePlayerId: firstPlayerId,
			phase: "untap",
			landsPlayedThisTurn: 0,
			priorityPlayerId: firstPlayerId,
			consecutivePasses: 0,
			stack: [],
			players,
			library: this.deck.buildSharedDeck(copiesPerLand),
			graveyard: [],
			pendingCtx: null,
			resolutionCtx: null,
			log: [],
		};

		this.deck.shuffleLibrary(draft);
		// The log is public, and the seed determines the library order, so the
		// seed must not appear in it. It stays available via GameState.seed.
		appendLog(
			draft,
			`Game start. Shared library: ${draft.library.length} cards.`,
		);

		// Deal round-robin, one card at a time, from the shared library.
		for (let i = 0; i < OPENING_HAND_SIZE; i++) {
			for (const id of PLAYER_IDS) {
				this.deck.drawCard(draft, id);
			}
		}
		appendLog(
			draft,
			`Each player draws an opening hand of ${OPENING_HAND_SIZE}.`,
		);

		this.turns.beginGame(draft);
		return draft;
	}
}
