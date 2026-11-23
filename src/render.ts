import { PHASE_LABELS, type Phase } from "./phases";
import { opponentOf, PLAYER_IDS } from "./players";
import type { GameState, PendingContext, PlayerId } from "./types";
import type { GameView, ViewPrompt } from "./view";

/** Collapses duplicates ("Swamp x2"). For unordered zones. */
function summarizeCards(cards: readonly { readonly name: string }[]): string {
	if (cards.length === 0) {
		return "-";
	}
	const counts = new Map<string, number>();
	for (const card of cards) {
		counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
	}
	return [...counts]
		.map(([name, n]) => (n > 1 ? `${name} x${n}` : name))
		.join(", ");
}

/** Lists cards in order, top first. For ordered zones such as the graveyard. */
function listCards(cards: readonly { readonly name: string }[]): string {
	return cards.length === 0 ? "-" : cards.map((c) => c.name).join(", ");
}

function describeBattlefield(
	battlefield: readonly {
		readonly card: { readonly name: string };
		readonly tapped: boolean;
	}[],
): string {
	const field = battlefield.map((p) => ({
		name: p.tapped ? `${p.card.name} (tapped)` : p.card.name,
	}));
	return `Battlefield (${field.length}): ${summarizeCards(field)}`;
}

/** The fields the status line needs. Both GameState and GameView have them. */
interface StatusFields {
	status: "active" | "finished";
	turnNumber: number;
	phase: Phase;
	activePlayerId: PlayerId;
	priorityPlayerId: PlayerId | null;
	resolutionCtx: { readonly controllerId: PlayerId } | null;
	players: Record<PlayerId, { readonly name: string }>;
}

/** One-line status, shown after every input. */
export function renderStatus(state: StatusFields): string {
	if (state.status === "finished") {
		return "== Game over ==";
	}
	const active = state.players[state.activePlayerId];
	const focus = state.resolutionCtx
		? `resolving, ${state.players[state.resolutionCtx.controllerId].name} decides`
		: `priority: ${state.priorityPlayerId ? state.players[state.priorityPlayerId].name : "-"}`;
	return `== Turn ${state.turnNumber} | ${PHASE_LABELS[state.phase]} | ${active.name}'s turn | ${focus} ==`;
}

export function renderConsidering(pending: PendingContext): string {
	const chosen = pending.selections
		.map((s) => `${s.step}=${s.label}`)
		.join(", ");
	return `Considering: ${pending.label}${chosen ? ` [${chosen}]` : ""}`;
}

function sharedZoneLines(zones: {
	librarySize: number;
	graveyard: readonly { readonly name: string }[];
	stack: readonly { readonly description: string }[];
}): string[] {
	const lines = [
		`  Shared library: ${zones.librarySize} cards`,
		`  Shared graveyard (${zones.graveyard.length}, top first): ${listCards(zones.graveyard)}`,
	];
	if (zones.stack.length > 0) {
		lines.push(
			`  Stack (${zones.stack.length}): ${zones.stack.map((s) => s.description).join(", ")}`,
		);
	}
	return lines;
}

/**
 * Full board from the omniscient state (all hands visible: this is a hot-seat
 * debugging view, fed by `engine.exportState()`). Players' clients use
 * `renderView` instead.
 */
export function renderBoard(state: GameState): string {
	const lines = [renderStatus(state)];
	for (const id of PLAYER_IDS) {
		const player = state.players[id];
		const marker = player.id === state.priorityPlayerId ? ">" : " ";
		const tag = player.id === state.activePlayerId ? " (active)" : "";
		lines.push(`${marker} ${player.name}${tag}`);
		lines.push(
			`    Hand (${player.hand.length}): ${summarizeCards(player.hand)}`,
		);
		lines.push(`    ${describeBattlefield(player.battlefield)}`);
	}
	lines.push(
		...sharedZoneLines({
			librarySize: state.library.length,
			graveyard: state.graveyard,
			stack: state.stack,
		}),
	);
	if (state.pendingCtx) {
		lines.push(`  ${renderConsidering(state.pendingCtx)}`);
	}
	return lines.join("\n");
}

/** The board as one player sees it: their own hand in full, the opponent's as a count. */
export function renderView(view: GameView): string {
	const lines = [renderStatus(view)];
	for (const id of PLAYER_IDS) {
		const player = view.players[id];
		const marker = player.id === view.priorityPlayerId ? ">" : " ";
		const tags = [
			...(player.id === view.activePlayerId ? ["active"] : []),
			...(player.id === view.viewerId ? ["you"] : []),
		];
		lines.push(
			`${marker} ${player.name}${tags.length > 0 ? ` (${tags.join(", ")})` : ""}`,
		);
		lines.push(
			id === view.viewerId
				? `    Hand (${view.hand.length}): ${summarizeCards(view.hand)}`
				: `    Hand: ${player.handSize} cards`,
		);
		lines.push(`    ${describeBattlefield(player.battlefield)}`);
	}
	lines.push(...sharedZoneLines(view));
	if (view.pendingCtx) {
		lines.push(`  ${renderConsidering(view.pendingCtx)}`);
	}
	return lines.join("\n");
}

export function renderPrompt(
	prompt: ViewPrompt,
	players: Record<PlayerId, { readonly name: string }>,
): string {
	switch (prompt.kind) {
		case "gameOver": {
			const winner = players[opponentOf(prompt.result.loserId)];
			return `Game over: ${prompt.result.reason}. ${winner.name} wins.`;
		}
		case "waiting":
			return `Waiting for ${players[prompt.onPlayerId].name}...`;
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
