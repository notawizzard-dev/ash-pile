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
		const endsPhase =
			state.stack.length === 0 && state.consecutivePasses + 1 >= PLAYER_COUNT;
		const nextName = viewPlayer(state, opponentOf(playerId)).name;
		const phaseLabel = PHASE_LABELS[state.phase];

		return [
			{
				id: "pass-priority",
				label: "Pass priority",
				passesPriority: true,
				steps: [],
				summarize: () =>
					endsPhase
						? `Pass priority. Everyone has passed, so the ${phaseLabel} phase ends`
						: `Pass priority to ${nextName}`,
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
