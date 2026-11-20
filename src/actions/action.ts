import type {
	Choice,
	DeepReadonly,
	GameState,
	PlayerId,
	Selection,
} from "../types";

/**
 * One parameter of an action (a target, a creature to sacrifice, ...).
 * Steps are asked one at a time, in order, and each step's options may depend
 * on earlier selections.
 *
 * Contract: `options` must be non-empty for every selection path the action
 * offers. Filter earlier steps so they never lead to a dead end.
 */
export interface ParamStep {
	name: string;
	prompt: string;
	options(
		state: DeepReadonly<GameState>,
		selections: readonly Selection[],
	): Choice[];
}

/**
 * One concrete thing a player could start doing right now, e.g.
 * "Play Mountain" or "Cast Bite Down". It shows up in the top-level list;
 * its `steps` are then walked through one at a time.
 */
export interface ActionCandidate {
	/** Unique among the candidates offered at one moment; stable while the state is unchanged. */
	id: string;
	label: string;
	/** Candidates sharing a key collapse into one option (e.g. three identical Mountains). */
	groupKey?: string;
	/** True only for the action that passes priority; all others reset the pass count. */
	passesPriority?: boolean;
	steps: readonly ParamStep[];
	/** One line shown at the confirm prompt. */
	summarize(selections: readonly Selection[]): string;
	/**
	 * Apply the action. Receives a private draft of the state: mutate it freely.
	 * It is only committed if this (and everything after it) succeeds.
	 */
	execute(draft: GameState, selections: readonly Selection[]): void;
}

/** A family of actions (play a land, cast a spell, ...). Register these with the engine. */
export interface ActionDefinition {
	candidates(
		state: DeepReadonly<GameState>,
		playerId: PlayerId,
	): ActionCandidate[];
}
