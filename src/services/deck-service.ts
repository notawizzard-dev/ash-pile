import { BASIC_LAND_NAMES } from "../cards";
import { Rng } from "../rng";
import type { CardInstance, GameState, PlayerId } from "../types";
import { getPlayer } from "../util";

export class DeckService {
	/** The shared deck: `copiesPerLand` of each basic land, in a fixed (unshuffled) order. */
	buildSharedDeck(copiesPerLand: number): CardInstance[] {
		const cards: CardInstance[] = [];
		for (const name of BASIC_LAND_NAMES) {
			for (let copy = 1; copy <= copiesPerLand; copy++) {
				cards.push({ id: `${name.toLowerCase()}-${copy}`, name });
			}
		}
		return cards;
	}

	shuffleLibrary(draft: GameState): void {
		const rng = new Rng(draft.rngState);
		rng.shuffle(draft.library);
		draft.rngState = rng.state;
	}

	/** Move the top card of the shared library into a player's hand. Null if the library is empty. */
	drawCard(draft: GameState, playerId: PlayerId): CardInstance | null {
		const card = draft.library.shift();
		if (!card) {
			return null;
		}
		getPlayer(draft, playerId).hand.push(card);
		return card;
	}
}
