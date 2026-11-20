import { PHASE_LABELS } from "./phases";
import { opponentOf, PLAYER_IDS } from "./players";
import type { ActionPrompt, DeepReadonly, GameState } from "./types";
import { viewPlayer } from "./util";

function summarizeCards(cards: readonly { readonly name: string }[]): string {
	if (cards.length === 0) return "-";
	const counts = new Map<string, number>();
	for (const card of cards)
		counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
	return [...counts]
		.map(([name, n]) => (n > 1 ? `${name} x${n}` : name))
		.join(", ");
}

/** One-line status, shown after every input. */
export function renderStatus(state: DeepReadonly<GameState>): string {
	if (state.status === "finished") return "== Game over ==";
	const active = viewPlayer(state, state.activePlayerId);
	const holder = viewPlayer(state, state.priorityPlayerId);
	return `== Turn ${state.turnNumber} | ${PHASE_LABELS[state.phase]} | ${active.name}'s turn | priority: ${holder.name} ==`;
}

/** Full board, omniscient (all hands visible: this is a hot-seat debugging view). */
export function renderBoard(state: DeepReadonly<GameState>): string {
	const lines = [renderStatus(state)];
	for (const id of PLAYER_IDS) {
		const player = state.players[id];
		const marker = player.id === state.priorityPlayerId ? ">" : " ";
		const tag = player.id === state.activePlayerId ? " (active)" : "";
		lines.push(`${marker} ${player.name}${tag}`);
		lines.push(
			`    Hand (${player.hand.length}): ${summarizeCards(player.hand)}`,
		);
		const field = player.battlefield.map((p) => ({
			name: p.tapped ? `${p.card.name} (tapped)` : p.card.name,
		}));
		lines.push(`    Battlefield (${field.length}): ${summarizeCards(field)}`);
		lines.push(
			`    Graveyard (${player.graveyard.length}): ${summarizeCards(player.graveyard)}`,
		);
	}
	lines.push(`  Shared library: ${state.library.length} cards`);
	if (state.pending) {
		const chosen = state.pending.selections
			.map((s) => `${s.step}=${s.label}`)
			.join(", ");
		lines.push(
			`  Considering: ${state.pending.label}${chosen ? ` [${chosen}]` : ""}`,
		);
	}
	return lines.join("\n");
}

export function renderPrompt(
	prompt: DeepReadonly<ActionPrompt>,
	state: DeepReadonly<GameState>,
): string {
	switch (prompt.kind) {
		case "gameOver": {
			const winner = viewPlayer(state, opponentOf(prompt.result.loserId));
			return `Game over: ${prompt.result.reason}. ${winner.name} wins.`;
		}
		case "confirm":
			return `${prompt.actionLabel}: ${prompt.summary}\n  [y] confirm   [b] back`;
		case "chooseAction":
		case "chooseParameter": {
			const header =
				prompt.kind === "chooseAction"
					? prompt.prompt
					: `${prompt.actionLabel} > ${prompt.prompt}`;
			const options = prompt.options.map((o, i) => `  ${i + 1}) ${o.label}`);
			const footer = prompt.kind === "chooseParameter" ? ["  [b] back"] : [];
			return [header, ...options, ...footer].join("\n");
		}
	}
}
