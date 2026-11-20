import { isLand } from "../cards";
import type { DeepReadonly, GameState, PlayerId } from "../types";
import { appendLog, getPlayer, viewPlayer } from "../util";
import type { ActionCandidate, ActionDefinition } from "./action";

export const LAND_DROPS_PER_TURN = 1;

/** Special action: put a land from your hand onto the battlefield. Doesn't use the stack. */
export class PlayLandAction implements ActionDefinition {
	candidates(
		state: DeepReadonly<GameState>,
		playerId: PlayerId,
	): ActionCandidate[] {
		if (state.activePlayerId !== playerId) return [];
		if (state.phase !== "main1" && state.phase !== "main2") return [];
		if (state.stack.length > 0) return [];
		if (state.landsPlayedThisTurn >= LAND_DROPS_PER_TURN) return [];

		return viewPlayer(state, playerId)
			.hand.filter(isLand)
			.map((card) => ({
				id: `play-land:${card.id}`,
				label: `Play ${card.name}`,
				// Identical lands in hand collapse into a single option.
				groupKey: `play-land:${card.name}`,
				steps: [],
				summarize: () => `Play ${card.name} from your hand`,
				execute: (draft: GameState) => {
					const player = getPlayer(draft, playerId);
					const index = player.hand.findIndex((c) => c.id === card.id);
					const moved = player.hand[index];
					if (!moved)
						throw new Error(`${card.id} is not in ${player.name}'s hand`);
					player.hand.splice(index, 1);
					player.battlefield.push({
						card: moved,
						controllerId: playerId,
						tapped: false,
					});
					draft.landsPlayedThisTurn += 1;
					appendLog(draft, `${player.name} plays ${card.name}.`);
				},
			}));
	}
}
