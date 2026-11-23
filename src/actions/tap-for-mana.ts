import { getCardDefinition } from "../cards";
import type { ManaService } from "../services/mana-service";
import type { DeepReadonly, GameState, PlayerId } from "../types";
import { viewPlayer } from "../util";
import type { ActionCandidate, ActionDefinition } from "./action";

/**
 * Mana ability: tap a land for mana, adding it to your pool. Doesn't use the
 * stack. Players tap by hand so they can choose which lands to keep untapped
 * (e.g. for a land's other abilities), rather than leaving it to auto-payment.
 */
export class TapForManaAction implements ActionDefinition {
	constructor(private readonly mana: ManaService) {}

	candidates(
		state: DeepReadonly<GameState>,
		playerId: PlayerId,
	): ActionCandidate[] {
		if (state.resolutionCtx) {
			return [];
		}

		return viewPlayer(state, playerId).battlefield.flatMap((permanent) => {
			const produced = getCardDefinition(permanent.card.name).tapForMana;
			if (!produced || permanent.tapped) {
				return [];
			}
			const name = permanent.card.name;
			const cardId = permanent.card.id;
			return [
				{
					id: `tap-mana:${cardId}`,
					label: `Tap ${name} for {${produced}}`,
					// Identical untapped lands collapse into a single option.
					groupKey: `tap-mana:${name}`,
					steps: [],
					summarize: () => `Tap ${name} for {${produced}}`,
					execute: (draft: GameState) => {
						this.mana.tapForMana(draft, playerId, cardId);
					},
				},
			];
		});
	}
}
