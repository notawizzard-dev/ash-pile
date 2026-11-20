import readline from "node:readline";
import { GameEngine } from "./engine";
import { renderBoard, renderPrompt, renderStatus } from "./render";
import type { InputResult, PlayerId, PlayerInput } from "./types";

const HELP = `Commands:
  <number>     pick that option from the list
  y            confirm the action shown
  b            go back one step (cancels the action if nothing is chosen yet)
  p            shortcut: pass priority (selects it and confirms)
  board        show the full board (all hands are visible: hot-seat debug view)
  library      show the shared library in order (top first)
  log          show the full game log
  state        dump the raw game state as JSON
  help         show this message
  q            quit`;

function parseSeed(argv: string[]): number | undefined {
	const i = argv.indexOf("--seed");
	if (i < 0) return undefined;
	const value = Number(argv[i + 1]);
	if (!Number.isInteger(value) || value < 0) {
		console.error("--seed needs a non-negative integer");
		process.exit(1);
	}
	return value;
}

const engine = new GameEngine({ seed: parseSeed(process.argv.slice(2)) });

function show(opts: { board: boolean }): void {
	const state = engine.getState();
	console.log("");
	console.log(opts.board ? renderBoard(state) : renderStatus(state));
	if (state.pending && !opts.board) {
		const chosen = state.pending.selections
			.map((s) => `${s.step}=${s.label}`)
			.join(", ");
		console.log(
			`Considering: ${state.pending.label}${chosen ? ` [${chosen}]` : ""}`,
		);
	}
	console.log(renderPrompt(engine.getLegalActions(), state));
}

/** Submit as whoever currently holds the decision (hot-seat). */
function submit(
	build: (playerId: PlayerId) => PlayerInput,
): InputResult | undefined {
	const prompt = engine.getLegalActions();
	if (prompt.kind === "gameOver") {
		console.log("The game is over.");
		return undefined;
	}
	const result = engine.submitInput(build(prompt.playerId));
	if (!result.ok) console.log(`! ${result.error}`);
	else for (const line of result.log) console.log(`  . ${line}`);
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
	const prompt = engine.getLegalActions();

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
			console.log(JSON.stringify(engine.getState(), null, 2));
			return {};
		case "log":
			engine.getState().log.forEach((l) => {
				console.log(`  . ${l}`);
			});
			return {};
		case "library": {
			const names = engine.getState().library.map((c) => c.name);
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
			if (!select?.ok) return {};
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
		`Game engine CLI (seed ${engine.getState().seed}). Type "help" for commands.`,
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
		if (outcome.quit) break;
		show({ board: outcome.board === true });
		rl.prompt();
	}
	rl.close();
};

run();
