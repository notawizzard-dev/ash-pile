import type { ActionDefinition } from "./actions/action";
import { CastSpellAction } from "./actions/cast-spell";
import { PassPriorityAction } from "./actions/pass-priority";
import { PlayLandAction } from "./actions/play-land";
import { TapForManaAction } from "./actions/tap-for-mana";
import { ActionService } from "./services/action-service";
import { DeckService } from "./services/deck-service";
import { ManaService } from "./services/mana-service";
import { ResolutionService } from "./services/resolution-service";
import { GameSetupService, type SetupOptions } from "./services/setup-service";
import { TurnService } from "./services/turn-service";
import { ViewService } from "./services/view-service";
import type {
	GameState,
	InputResult,
	PendingContext,
	PlayerId,
	PlayerInput,
} from "./types";
import { getPlayer, InvalidInputError } from "./util";
import type { GameView } from "./view";

export interface GameOptions extends SetupOptions {
	/** Extra action families, added after the built-in ones. Mainly for tests and experiments. */
	extraActions?: readonly ActionDefinition[];
}

/**
 * The public face of the rules engine. Three things you can do:
 *
 * - `getView(playerId)`: observe the game as that player sees it, including what
 *                        they are being asked to decide next
 * - `submitInput()`:     answer; the only way the game state ever changes
 * - `exportState()`:     the full, omniscient state, for saving, tests and
 *                        debugging only. Never hand this to a player's client.
 *
 * Everything handed out is a fresh deep copy, so callers cannot reach the
 * engine's own state. Inside submitInput the engine works on a private draft
 * and swaps it in only if the whole input succeeded, so a failure can never
 * leave the game half-updated.
 */
export class GameEngine {
	private state: GameState;
	private readonly actions: ActionService;
	private readonly views: ViewService;

	constructor(options: GameOptions = {}) {
		const deck = new DeckService();
		const mana = new ManaService();
		const resolution = new ResolutionService();
		const turns = new TurnService(deck, mana, resolution);
		this.actions = new ActionService([
			new PlayLandAction(),
			new TapForManaAction(mana),
			new CastSpellAction(mana),
			new PassPriorityAction(turns),
			...(options.extraActions ?? []),
		]);
		this.views = new ViewService(this.actions);
		this.state = new GameSetupService(deck, turns).createInitialState(options);
	}

	/** Resume from a saved (or hand-built) state. The state is copied, not adopted. */
	static fromState(
		state: GameState,
		options: Pick<GameOptions, "extraActions"> = {},
	): GameEngine {
		const engine = new GameEngine(options);
		engine.state = structuredClone(state);
		return engine;
	}

	/** The game as `viewerId` is allowed to see it. Contains no hidden information. */
	getView(viewerId: PlayerId): GameView {
		return this.views.buildView(this.state, viewerId);
	}

	/** Full, omniscient copy of the state (hands, library order and seed included). */
	exportState(): GameState {
		return structuredClone(this.state);
	}

	submitInput(input: PlayerInput): InputResult {
		const draft = structuredClone(this.state);
		const logStart = draft.log.length;
		try {
			this.applyInput(draft, input);
		} catch (error) {
			if (error instanceof InvalidInputError) {
				return { ok: false, error: error.message };
			}
			throw error; // a real bug: surface it. `this.state` is untouched.
		}
		this.state = draft;
		return { ok: true, log: draft.log.slice(logStart) };
	}

	private applyInput(draft: GameState, input: PlayerInput): void {
		const prompt = this.actions.getPrompt(draft);
		if (prompt.kind === "gameOver") {
			throw new InvalidInputError("The game is over.");
		}
		if (input.playerId !== prompt.playerId) {
			throw new InvalidInputError(
				`It is ${getPlayer(draft, prompt.playerId).name}'s decision.`,
			);
		}

		switch (input.type) {
			case "select": {
				if (prompt.kind === "confirm") {
					throw new InvalidInputError("Confirm the action, or go back.");
				}
				const choice = prompt.options.find((o) => o.id === input.optionId);
				if (!choice) {
					throw new InvalidInputError(
						`"${input.optionId}" is not a legal choice right now.`,
					);
				}
				if (prompt.kind === "chooseAction") {
					draft.pendingCtx = {
						playerId: prompt.playerId,
						candidateId: choice.id,
						label: choice.label,
						selections: [],
					};
				} else {
					requirePendingCtx(draft).selections.push({
						step: prompt.parameter,
						optionId: choice.id,
						label: choice.label,
					});
				}
				return;
			}

			case "confirm": {
				if (prompt.kind !== "confirm") {
					throw new InvalidInputError("There is nothing to confirm yet.");
				}
				const pending = requirePendingCtx(draft);
				const candidate = this.actions.getCandidate(
					draft,
					pending.playerId,
					pending.candidateId,
				);
				if (!candidate) {
					throw new Error(`Pending action "${pending.candidateId}" vanished`);
				}
				draft.pendingCtx = null;
				if (!candidate.passesPriority) {
					draft.consecutivePasses = 0;
				}
				candidate.execute(draft, pending.selections);
				return;
			}

			case "back": {
				if (!draft.pendingCtx) {
					throw new InvalidInputError("There is nothing to go back from.");
				}
				if (draft.pendingCtx.selections.length > 0) {
					draft.pendingCtx.selections.pop();
				} else {
					draft.pendingCtx = null;
				}
				return;
			}
		}
	}
}

function requirePendingCtx(draft: GameState): PendingContext {
	if (!draft.pendingCtx) {
		throw new Error("Expected a pending context");
	}
	return draft.pendingCtx;
}
