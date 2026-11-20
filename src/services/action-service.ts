import type { ActionCandidate, ActionDefinition } from "../actions/action";
import type { ActionPrompt, DeepReadonly, GameState, PlayerId } from "../types";
import { viewPlayer } from "../util";

/**
 * Turns the registered action definitions plus the current state into the
 * prompt the player should see next. Read-only: never mutates state.
 *
 * The prompt is derived entirely from `state` (including `state.pending`),
 * so there is no hidden conversation state in the engine.
 */
export class ActionService {
	constructor(private readonly definitions: readonly ActionDefinition[]) {}

	getCandidates(
		state: DeepReadonly<GameState>,
		playerId: PlayerId,
	): ActionCandidate[] {
		const seenGroups = new Set<string>();
		const seenIds = new Set<string>();
		const candidates: ActionCandidate[] = [];
		for (const definition of this.definitions) {
			for (const candidate of definition.candidates(state, playerId)) {
				const group = candidate.groupKey ?? candidate.id;
				if (seenGroups.has(group)) continue;
				if (seenIds.has(candidate.id)) {
					throw new Error(
						`Two different actions share the id "${candidate.id}"`,
					);
				}
				seenGroups.add(group);
				seenIds.add(candidate.id);
				candidates.push(candidate);
			}
		}
		return candidates;
	}

	getCandidate(
		state: DeepReadonly<GameState>,
		playerId: PlayerId,
		candidateId: string,
	): ActionCandidate | undefined {
		return this.getCandidates(state, playerId).find(
			(c) => c.id === candidateId,
		);
	}

	getPrompt(state: DeepReadonly<GameState>): ActionPrompt {
		if (state.status === "finished" && state.result) {
			return { kind: "gameOver", result: { ...state.result } };
		}

		const playerId = state.priorityPlayerId;
		const pending = state.pending;

		if (!pending) {
			const player = viewPlayer(state, playerId);
			return {
				kind: "chooseAction",
				playerId,
				prompt: `${player.name}, choose an action`,
				options: this.getCandidates(state, playerId).map((c) => ({
					id: c.id,
					label: c.label,
				})),
			};
		}

		const candidate = this.getCandidate(
			state,
			pending.playerId,
			pending.candidateId,
		);
		if (!candidate) {
			throw new Error(
				`Pending action "${pending.candidateId}" is no longer legal`,
			);
		}

		const selections = pending.selections.map((s) => ({ ...s }));
		const step = candidate.steps[selections.length];
		if (!step) {
			return {
				kind: "confirm",
				playerId,
				actionLabel: candidate.label,
				summary: candidate.summarize(selections),
				selections,
			};
		}

		const options = step.options(state, selections);
		if (options.length === 0) {
			throw new Error(
				`Step "${step.name}" of "${candidate.id}" has no options (dead end)`,
			);
		}
		return {
			kind: "chooseParameter",
			playerId,
			actionLabel: candidate.label,
			parameter: step.name,
			prompt: step.prompt,
			options,
			selections,
		};
	}
}
