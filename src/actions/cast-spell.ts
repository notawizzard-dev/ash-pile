import { type CardDefinition, getCardDefinition } from "../cards";
import { formatManaCost, payFromPool } from "../mana";
import type { ManaService } from "../services/mana-service";
import type { CardInstance, DeepReadonly, GameState, PlayerId } from "../types";
import { appendLog, getPlayer, viewPlayer } from "../util";
import type { ActionCandidate, ActionDefinition } from "./action";

/**
 * Cast a spell from your hand: pay its cost from your floating mana and put it
 * on the stack. It resolves later, when everyone has passed in a row.
 */
export class CastSpellAction implements ActionDefinition {
	constructor(private readonly mana: ManaService) {}

	candidates(
		state: DeepReadonly<GameState>,
		playerId: PlayerId,
	): ActionCandidate[] {
		if (state.resolutionCtx) {
			return [];
		}
		if (state.priorityPlayerId !== playerId) {
			return [];
		}

		const player = viewPlayer(state, playerId);
		return player.hand.flatMap((card): ActionCandidate[] => {
			const { manaCost } = getCardDefinition(card.name);
			// Lands have no cost: they are played, not cast.
			if (!manaCost) {
				return [];
			}
			if (!canCastNow(state, playerId, getCardDefinition(card.name))) {
				return [];
			}
			// Only floating mana pays for now: nothing taps lands automatically.
			if (!payFromPool(player.manaPool, manaCost)) {
				return [];
			}
			return [
				{
					id: `cast:${card.id}`,
					label: `Cast ${card.name}`,
					// Identical copies in hand collapse into a single option.
					groupKey: `cast:${card.name}`,
					steps: [],
					summarize: () =>
						`Cast ${card.name}, paying ${formatManaCost(manaCost)}`,
					execute: (draft: GameState) => {
						const caster = getPlayer(draft, playerId);
						const index = caster.hand.findIndex((c) => c.id === card.id);
						const moved: CardInstance | undefined = caster.hand[index];
						if (!moved) {
							throw new Error(`${card.id} is not in ${caster.name}'s hand`);
						}
						this.mana.payCost(draft, playerId, manaCost);
						caster.hand.splice(index, 1);
						draft.stack.unshift({
							id: `spell:${moved.id}`,
							kind: "spell",
							card: moved,
							controllerId: playerId,
						});
						appendLog(draft, `${caster.name} casts ${moved.name}.`);
					},
				},
			];
		});
	}
}

/** Instants can be cast whenever you hold priority; anything else only at sorcery speed. */
function canCastNow(
	state: DeepReadonly<GameState>,
	playerId: PlayerId,
	definition: CardDefinition,
): boolean {
	if (definition.types.includes("instant")) {
		return true;
	}
	return (
		state.activePlayerId === playerId &&
		(state.phase === "main1" || state.phase === "main2") &&
		state.stack.length === 0
	);
}
