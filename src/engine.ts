import type { ActionDefinition } from "./actions/action";
import { PassPriorityAction } from "./actions/pass-priority";
import { PlayLandAction } from "./actions/play-land";
import { ActionService } from "./services/action-service";
import { DeckService } from "./services/deck-service";
import { GameSetupService, type SetupOptions } from "./services/setup-service";
import { TurnService } from "./services/turn-service";
import type {
	ActionPrompt,
	DeepReadonly,
	GameState,
	InputResult,
	PendingAction,
	PlayerInput,
} from "./types";
import { deepFreeze, getPlayer, InvalidInputError, thaw } from "./util";

export interface GameOptions extends SetupOptions {
	/** Extra action families, added after the built-in ones. Mainly for tests and experiments. */
	extraActions?: readonly ActionDefinition[];
}

/**
 * The public face of the rules engine. Three things you can do:
 *
 *   getState()        observe the game
 *   getLegalActions() ask what the player can do next (one nested step at a time)
 *   submitInput()     answer; the only way the game state ever changes
 *
 * Everything handed out is a frozen deep copy, so callers cannot reach the
 * engine's own state. Inside submitInput the engine works on a private draft
 * and swaps it in only if the whole input succeeded, so a failure can never
 * leave the game half-updated.
 */
export class GameEngine {
	private state: GameState;
	private readonly actions: ActionService;

	constructor(options: GameOptions = {}) {
		const deck = new DeckService();
		const turns = new TurnService(deck);
		this.actions = new ActionService([
			new PlayLandAction(),
			new PassPriorityAction(turns),
			...(options.extraActions ?? []),
		]);
		this.state = new GameSetupService(deck, turns).createInitialState(options);
	}

	/** Resume from a saved (or hand-built) state. Handy for tests and save/load. */
	static fromState(
		state: DeepReadonly<GameState>,
		options: Pick<GameOptions, "extraActions"> = {},
	): GameEngine {
		const engine = new GameEngine(options);
		engine.state = thaw<GameState>(state);
		return engine;
	}

	/** Full, omniscient snapshot (hands and library order included). Frozen deep copy. */
	getState(): DeepReadonly<GameState> {
		return deepFreeze(structuredClone(this.state));
	}

	/** What the player holding priority can do next. Frozen deep copy. */
	getLegalActions(): DeepReadonly<ActionPrompt> {
		return deepFreeze(structuredClone(this.actions.getPrompt(this.state)));
	}

	submitInput(input: PlayerInput): InputResult {
		const draft = structuredClone(this.state);
		const logStart = draft.log.length;
		try {
			this.applyInput(draft, input);
		} catch (error) {
			if (error instanceof InvalidInputError)
				return { ok: false, error: error.message };
			throw error; // a real bug: surface it. `this.state` is untouched.
		}
		this.state = draft;
		return { ok: true, log: draft.log.slice(logStart) };
	}

	private applyInput(draft: GameState, input: PlayerInput): void {
		const prompt = this.actions.getPrompt(draft);
		if (prompt.kind === "gameOver")
			throw new InvalidInputError("The game is over.");
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
					draft.pending = {
						playerId: prompt.playerId,
						candidateId: choice.id,
						label: choice.label,
						selections: [],
					};
				} else {
					requirePending(draft).selections.push({
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
				const pending = requirePending(draft);
				const candidate = this.actions.getCandidate(
					draft,
					pending.playerId,
					pending.candidateId,
				);
				if (!candidate)
					throw new Error(`Pending action "${pending.candidateId}" vanished`);
				draft.pending = null;
				if (!candidate.passesPriority) draft.consecutivePasses = 0;
				candidate.execute(draft, pending.selections);
				return;
			}

			case "back": {
				if (!draft.pending)
					throw new InvalidInputError("There is nothing to go back from.");
				if (draft.pending.selections.length > 0) {
					draft.pending.selections.pop();
				} else {
					draft.pending = null;
				}
				return;
			}
		}
	}
}

function requirePending(draft: GameState): PendingAction {
	if (!draft.pending) throw new Error("Expected a pending action");
	return draft.pending;
}
