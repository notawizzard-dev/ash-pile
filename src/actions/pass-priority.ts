import { PHASE_LABELS } from "../phases";
import { opponentOf, PLAYER_COUNT } from "../players";
import type { TurnService } from "../services/turn-service";
import type { DeepReadonly, GameState, PlayerId } from "../types";
import { appendLog, getPlayer, viewPlayer } from "../util";
import type { ActionCandidate, ActionDefinition } from "./action";

export class PassPriorityAction implements ActionDefinition {
	constructor(private readonly turns: TurnService) {}

	candidates(
		state: DeepReadonly<GameState>,
		playerId: PlayerId,
	): ActionCandidate[] {
		// Nobody holds priority while an event is resolving.
		if (state.resolutionCtx) {
			return [];
		}

		const everyonePasses = state.consecutivePasses + 1 >= PLAYER_COUNT;
		const topSpell = state.stack[0];
		const nextName = viewPlayer(state, opponentOf(playerId)).name;
		const phaseLabel = PHASE_LABELS[state.phase];

		return [
			{
				id: "pass-priority",
				label: "Pass priority",
				passesPriority: true,
				steps: [],
				summarize: () => {
					if (!everyonePasses) {
						return `Pass priority to ${nextName}`;
					}
					return topSpell
						? `Pass priority. Everyone has passed, so ${topSpell.card.name} resolves`
						: `Pass priority. Everyone has passed, so the ${phaseLabel} phase ends`;
				},
				execute: (draft: GameState) => {
					appendLog(
						draft,
						`${getPlayer(draft, playerId).name} passes priority.`,
					);
					this.turns.passPriority(draft);
				},
			},
		];
	}
}
