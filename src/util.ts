import type { DeepReadonly, GameState, PlayerId, PlayerState } from "./types";

/** The player's input is not legal right now. Never indicates an engine bug. */
export class InvalidInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidInputError";
	}
}

/** The player holding priority. Throws while an event is resolving (nobody holds it then). */
export function priorityHolderOf(state: DeepReadonly<GameState>): PlayerId {
	if (state.priorityPlayerId === null) {
		throw new Error("Nobody holds priority right now");
	}
	return state.priorityPlayerId;
}

/**
 * Whose decision the game is waiting on: the resolving event's controller if
 * something is resolving, otherwise the priority holder.
 */
export function decidingPlayerId(state: DeepReadonly<GameState>): PlayerId {
	return state.resolutionCtx
		? state.resolutionCtx.controllerId
		: priorityHolderOf(state);
}

export function appendLog(draft: GameState, message: string): void {
	draft.log.push(message);
}

export function getPlayer(state: GameState, id: PlayerId): PlayerState {
	return state.players[id];
}

export function viewPlayer(
	state: DeepReadonly<GameState>,
	id: PlayerId,
): DeepReadonly<PlayerState> {
	return state.players[id];
}
