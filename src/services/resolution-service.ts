import { getCardDefinition } from "../cards";
import type { GameState } from "../types";
import { appendLog } from "../util";

/**
 * Resolving spells off the stack. Mutates the draft it is given; only ever
 * called from inside GameEngine.submitInput.
 */
export class ResolutionService {
	/**
	 * Resolve the top item of the stack. Card-specific effects will run here,
	 * before the card is put where it belongs; none exist yet, so a spell only
	 * gets the normal treatment.
	 */
	resolveTopOfStack(draft: GameState): void {
		const item = draft.stack.shift();
		if (!item) {
			throw new Error("The stack is empty");
		}
		const { card } = item;
		appendLog(draft, `${card.name} resolves.`);

		// Normal resolution: an instant or sorcery goes to the top of the shared graveyard.
		const { types } = getCardDefinition(card.name);
		if (types.includes("instant") || types.includes("sorcery")) {
			draft.graveyard.unshift(card);
			appendLog(draft, `${card.name} is put into the graveyard.`);
			return;
		}
		throw new Error(`Resolving ${card.name} is not implemented yet.`);
	}
}
