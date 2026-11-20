/**
 * The engine is two-player only, so players are a closed set of ids rather
 * than an open array. That makes every lookup total (`state.players[id]` is
 * always a PlayerState) and "who is next / who is the opponent" a one-liner.
 */
export const PLAYER_IDS = ["p1", "p2"] as const;

export type PlayerId = (typeof PLAYER_IDS)[number];

export const PLAYER_COUNT = PLAYER_IDS.length;

export function opponentOf(id: PlayerId): PlayerId {
	return id === "p1" ? "p2" : "p1";
}
