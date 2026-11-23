import { PLAYER_IDS } from "../players";
import type { GameState, PlayerId } from "../types";
import type { GameView, PublicPlayerView, ViewPrompt } from "../view";
import type { ActionService } from "./action-service";

/**
 * Builds the per-player view of the game. Read-only: never mutates state.
 *
 * Every field is constructed explicitly rather than copied wholesale, so a
 * field added to GameState later is hidden from views until someone decides
 * to expose it here. Everything handed out is a fresh copy, so a caller can
 * mutate a view without touching the engine.
 */
export class ViewService {
	constructor(private readonly actions: ActionService) {}

	buildView(state: GameState, viewerId: PlayerId): GameView {
		const players = {} as Record<PlayerId, PublicPlayerView>;
		for (const id of PLAYER_IDS) {
			const player = state.players[id];
			players[id] = {
				id,
				name: player.name,
				handSize: player.hand.length,
				battlefield: structuredClone(player.battlefield),
			};
		}

		const resolution = state.resolutionCtx;
		const pending = state.pendingCtx;

		return {
			viewerId,
			status: state.status,
			result: structuredClone(state.result),
			turnNumber: state.turnNumber,
			activePlayerId: state.activePlayerId,
			phase: state.phase,
			landsPlayedThisTurn: state.landsPlayedThisTurn,
			priorityPlayerId: state.priorityPlayerId,
			consecutivePasses: state.consecutivePasses,
			stack: structuredClone(state.stack),
			hand: structuredClone(state.players[viewerId].hand),
			players,
			librarySize: state.library.length,
			graveyard: structuredClone(state.graveyard),
			pendingCtx:
				pending && pending.playerId === viewerId
					? structuredClone(pending)
					: null,
			resolutionCtx: resolution
				? {
						kind: resolution.kind,
						stackItemId: resolution.stackItemId,
						controllerId: resolution.controllerId,
					}
				: null,
			prompt: this.buildPrompt(state, viewerId),
			log: [...state.log],
		};
	}

	private buildPrompt(state: GameState, viewerId: PlayerId): ViewPrompt {
		const prompt = this.actions.getPrompt(state);
		if (prompt.kind === "gameOver" || prompt.playerId === viewerId) {
			return structuredClone(prompt);
		}
		return { kind: "waiting", onPlayerId: prompt.playerId };
	}
}
