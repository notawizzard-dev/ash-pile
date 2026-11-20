import { PHASE_LABELS, PHASES, type Phase } from "../phases";
import { opponentOf, PLAYER_COUNT } from "../players";
import type { GameState, PlayerId } from "../types";
import { appendLog, getPlayer } from "../util";
import type { DeckService } from "./deck-service";

/**
 * Turn structure and priority. All methods mutate the draft they are given;
 * they are only ever called from inside GameEngine.submitInput.
 */
export class TurnService {
	constructor(private readonly deck: DeckService) {}

	beginGame(draft: GameState): void {
		appendLog(
			draft,
			`Turn ${draft.turnNumber}: ${getPlayer(draft, draft.activePlayerId).name}`,
		);
		this.enterPhase(draft, "untap");
	}

	/** The priority holder passes. When everyone has passed in a row, the phase ends. */
	passPriority(draft: GameState): void {
		draft.consecutivePasses += 1;
		if (draft.consecutivePasses < PLAYER_COUNT) {
			draft.priorityPlayerId = opponentOf(draft.priorityPlayerId);
			return;
		}
		if (draft.stack.length > 0) {
			throw new Error("Stack resolution is not implemented yet.");
		}
		this.advancePhase(draft);
	}

	private advancePhase(draft: GameState): void {
		const next = PHASES[PHASES.indexOf(draft.phase) + 1];
		if (next) {
			this.enterPhase(draft, next);
		} else {
			this.beginNextTurn(draft);
		}
	}

	private beginNextTurn(draft: GameState): void {
		draft.activePlayerId = opponentOf(draft.activePlayerId);
		draft.turnNumber += 1;
		draft.landsPlayedThisTurn = 0;
		appendLog(
			draft,
			`Turn ${draft.turnNumber}: ${getPlayer(draft, draft.activePlayerId).name}`,
		);
		this.enterPhase(draft, "untap");
	}

	private enterPhase(draft: GameState, phase: Phase): void {
		const active = getPlayer(draft, draft.activePlayerId);
		draft.phase = phase;
		draft.consecutivePasses = 0;
		draft.priorityPlayerId = active.id;

		switch (phase) {
			case "untap":
				// Turn-based action only: no priority is given during the untap step.
				for (const permanent of active.battlefield) permanent.tapped = false;
				this.advancePhase(draft);
				return;

			case "draw":
				// The player who goes first skips their first draw.
				if (draft.turnNumber > 1) {
					const card = this.deck.drawCard(draft, active.id);
					if (!card) {
						this.finishGame(
							draft,
							active.id,
							`${active.name} tried to draw from an empty library`,
						);
						return;
					}
					appendLog(draft, `${active.name} draws a card.`);
				}
				break;

			default:
				break;
		}

		appendLog(draft, `${PHASE_LABELS[phase]} phase`);
	}

	private finishGame(
		draft: GameState,
		loserId: PlayerId,
		reason: string,
	): void {
		draft.status = "finished";
		draft.result = { loserId, reason };
		draft.pending = null;
		appendLog(draft, `Game over: ${reason}.`);
	}
}
