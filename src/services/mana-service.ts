import { getCardDefinition } from "../cards";
import { emptyManaPool } from "../mana";
import { PLAYER_IDS } from "../players";
import type { GameState, PlayerId } from "../types";
import { appendLog, getPlayer } from "../util";

/**
 * Mana mechanics. All methods mutate the draft they are given; they are only
 * ever called from inside GameEngine.submitInput.
 */
export class ManaService {
	/**
	 * Tap one of the player's untapped permanents for its mana. The mana floats
	 * in the player's pool until it is spent or the step or phase ends.
	 */
	tapForMana(draft: GameState, playerId: PlayerId, cardId: string): void {
		const player = getPlayer(draft, playerId);
		const permanent = player.battlefield.find((p) => p.card.id === cardId);
		if (!permanent) {
			throw new Error(`${cardId} is not on ${player.name}'s battlefield`);
		}
		if (permanent.tapped) {
			throw new Error(`${permanent.card.name} is already tapped`);
		}
		const mana = getCardDefinition(permanent.card.name).tapForMana;
		if (!mana) {
			throw new Error(`${permanent.card.name} has no mana ability`);
		}
		permanent.tapped = true;
		player.manaPool[mana] += 1;
		appendLog(
			draft,
			`${player.name} taps ${permanent.card.name} for {${mana}}.`,
		);
	}

	/** Mana empties from every pool as each step and phase ends. */
	emptyPools(draft: GameState): void {
		for (const id of PLAYER_IDS) {
			getPlayer(draft, id).manaPool = emptyManaPool();
		}
	}
}
