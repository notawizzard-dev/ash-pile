import readline from "node:readline";
import { GameEngine } from "./engine";
import { PLAYER_IDS } from "./players";
import {
	renderBoard,
	renderConsidering,
	renderPrompt,
	renderStatus,
	renderView,
} from "./render";
import type { InputResult, PlayerId, PlayerInput } from "./types";
import { decidingPlayerId } from "./util";
import type { GameView } from "./view";

const HELP = `Commands:
  <number>     pick that option from the list
  y            confirm the action shown
  b            go back one step (cancels the action if nothing is chosen yet)
  p            shortcut: pass priority (selects it and confirms)
  view [p1|p2] show the game as that player sees it (default: whoever is deciding)
  log          show the game log (as the deciding player sees it)
  board        DEBUG: full board, all hands visible
  library      DEBUG: show the shared library in order (top first)
  state        DEBUG: dump the raw game state as JSON
  help         show this message
  q            quit`;

function parseSeed(argv: string[]): number | undefined {
	const i = argv.indexOf("--seed");
	if (i < 0) {
		return undefined;
	}
	const value = Number(argv[i + 1]);
	if (!Number.isInteger(value) || value < 0) {
		console.error("--seed needs a non-negative integer");
		process.exit(1);
	}
	return value;
}

const engine = new GameEngine({ seed: parseSeed(process.argv.slice(2)) });

/** The view of whoever the game is waiting on (hot-seat: this CLI plays every seat). */
function currentView(): GameView {
	return engine.getView(decidingPlayerId(engine.exportState()));
}

function show(opts: { board: boolean }): void {
	const view = currentView();
	console.log("");
	if (opts.board) {
		// Omniscient debug board, so it is fed by the full state rather than a view.
		console.log(renderBoard(engine.exportState()));
	} else {
		console.log(renderStatus(view));
		if (view.pendingCtx) {
			console.log(renderConsidering(view.pendingCtx));
		}
	}
	console.log(renderPrompt(view.prompt, view.players));
}

/** Submit as whoever currently holds the decision (hot-seat). */
function submit(
	build: (playerId: PlayerId) => PlayerInput,
): InputResult | undefined {
	const view = currentView();
	if (view.prompt.kind === "gameOver") {
		console.log("The game is over.");
		return undefined;
	}
	const result = engine.submitInput(build(view.viewerId));
	if (!result.ok) {
		console.log(`! ${result.error}`);
	} else {
		for (const line of result.log) {
			console.log(`  . ${line}`);
		}
	}
	return result;
}

/** A committed input is "interesting" (worth a full board reprint) unless it only passed priority within a phase. */
function changedBoard(result: InputResult | undefined): boolean {
	return (
		result?.ok === true &&
		result.log.some((line) => !line.endsWith("passes priority."))
	);
}

/** Runs one command. `board` asks the caller to reprint the full board rather than just the status line. */
function handle(line: string): { quit?: boolean; board?: boolean } {
	const cmd = line.toLowerCase();
	const prompt = currentView().prompt;

	const [word, arg] = cmd.split(/\s+/);
	if (word === "view") {
		const target =
			arg === undefined
				? currentView().viewerId
				: PLAYER_IDS.find((id) => id === arg);
		if (target === undefined) {
			console.log(`! Usage: view [${PLAYER_IDS.join("|")}]`);
			return {};
		}
		console.log(renderView(engine.getView(target)));
		return {};
	}

	switch (cmd) {
		case "":
			return {};
		case "q":
		case "quit":
		case "exit":
			return { quit: true };
		case "help":
		case "?":
			console.log(HELP);
			return {};
		case "board":
			return { board: true };
		case "state":
			console.log(JSON.stringify(engine.exportState(), null, 2));
			return {};
		case "log":
			currentView().log.forEach((l) => {
				console.log(`  . ${l}`);
			});
			return {};
		case "library": {
			const names = engine.exportState().library.map((c) => c.name);
			console.log(
				`Library (${names.length}, top first):\n  ${names.join(", ")}`,
			);
			return {};
		}
		case "b":
		case "back":
		case "n":
		case "no":
			submit((playerId) => ({ type: "back", playerId }));
			return {};
		case "y":
		case "yes":
		case "confirm": {
			const result = submit((playerId) => ({ type: "confirm", playerId }));
			return { board: changedBoard(result) };
		}
		case "p":
		case "pass": {
			if (prompt.kind !== "chooseAction") {
				console.log("Finish or cancel (b) the current action first.");
				return {};
			}
			const select = submit((playerId) => ({
				type: "select",
				playerId,
				optionId: "pass-priority",
			}));
			if (!select?.ok) {
				return {};
			}
			const confirm = submit((playerId) => ({ type: "confirm", playerId }));
			return { board: changedBoard(confirm) };
		}
	}

	// A number picks by position; anything else is treated as a raw option id.
	if (prompt.kind === "chooseAction" || prompt.kind === "chooseParameter") {
		const index = /^\d+$/.test(cmd) ? Number(cmd) - 1 : -1;
		const optionId = index >= 0 ? prompt.options[index]?.id : line;
		if (optionId === undefined) {
			console.log(`! Pick a number from 1 to ${prompt.options.length}.`);
			return {};
		}
		submit((playerId) => ({ type: "select", playerId, optionId }));
		return {};
	}

	console.log(`! Unknown command "${line}". Type "help" for the list.`);
	return {};
}

const run = async () => {
	console.log(
		`Game engine CLI (seed ${engine.exportState().seed}). Type "help" for commands.`,
	);
	show({ board: true });

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: "> ",
	});
	rl.prompt();
	for await (const line of rl) {
		const outcome = handle(line.trim());
		if (outcome.quit) {
			break;
		}
		show({ board: outcome.board === true });
		rl.prompt();
	}
	rl.close();
};

run();
