import type { DeepReadonly, GameState, PlayerId, PlayerState } from "./types";

/** The player's input is not legal right now. Never indicates an engine bug. */
export class InvalidInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidInputError";
	}
}

export function deepFreeze<T>(value: T): DeepReadonly<T> {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const key of Reflect.ownKeys(value)) {
			deepFreeze((value as Record<PropertyKey, unknown>)[key]);
		}
	}
	return value as DeepReadonly<T>;
}

/** Deep-copy a readonly value into a mutable one. */
export function thaw<T>(value: DeepReadonly<T>): T {
	return structuredClone(value) as unknown as T;
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
