import { setKeybindings, TuiMainScreen } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultEditorTheme } from "../../tui/test/test-themes.ts";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import { CustomEditor } from "../src/modes/interactive/components/custom-editor.ts";

afterEach(() => {
	setKeybindings(new KeybindingsManager());
});

describe("CustomEditor prompt history keybindings", () => {
	it("gives an explicit history binding precedence over model cycling", () => {
		const keybindings = new KeybindingsManager({
			"tui.editor.historyPrevious": "ctrl+p",
			"tui.editor.historyNext": "ctrl+n",
		});
		setKeybindings(keybindings);
		const editor = new CustomEditor(new TuiMainScreen(new VirtualTerminal()), defaultEditorTheme, keybindings);
		let modelCycles = 0;
		editor.onAction("app.model.cycleForward", () => {
			modelCycles++;
		});
		editor.addToHistory("previous prompt");
		editor.setText("draft");

		editor.handleInput("\x10"); // Ctrl+P
		expect(editor.getText()).toBe("previous prompt");
		expect(modelCycles).toBe(0);

		editor.handleInput("\x0e"); // Ctrl+N
		expect(editor.getText()).toBe("draft");
	});
});

describe("CustomEditor selection page keybindings", () => {
	it("pages an open autocomplete menu before pasting an image with the same key (#7629)", async () => {
		// Bind both explicitly: the paste default is Alt+V on Windows and WSL.
		const keybindings = new KeybindingsManager({
			"tui.select.pageDown": "ctrl+v",
			"app.clipboard.pasteImage": "ctrl+v",
		});
		setKeybindings(keybindings);
		const editor = new CustomEditor(new TuiMainScreen(new VirtualTerminal()), defaultEditorTheme, keybindings);
		let pastes = 0;
		editor.onPasteImage = () => {
			pastes++;
		};
		let submitted = "";
		editor.onSubmit = (text) => {
			submitted = text;
		};
		editor.setAutocompleteProvider({
			getSuggestions: async () => ({
				items: Array.from({ length: 12 }, (_, index) => ({
					value: `/command-${index}`,
					label: `command-${index}`,
				})),
				prefix: "/",
			}),
			applyCompletion: (lines, cursorLine, _cursorCol, item) => ({
				lines: lines.map((line, index) => (index === cursorLine ? item.value : line)),
				cursorLine,
				cursorCol: item.value.length,
			}),
		});

		editor.handleInput("/");
		await vi.waitFor(() => expect(editor.isShowingAutocomplete()).toBe(true));
		editor.handleInput("\x16"); // Ctrl+V
		editor.handleInput("\r");

		expect(pastes).toBe(0);
		expect(submitted).toBe("/command-5");

		editor.handleInput("\x16"); // Ctrl+V with autocomplete closed pastes again
		expect(pastes).toBe(1);
	});
});

describe("CustomEditor paste hints (Windows Terminal image paste)", () => {
	it("treats a paste-key release as a paste hint (WT 1.25+ leaks the release, swallows the press)", () => {
		const keybindings = new KeybindingsManager({
			"app.clipboard.pasteImage": "ctrl+v",
		});
		setKeybindings(keybindings);
		const editor = new CustomEditor(new TuiMainScreen(new VirtualTerminal()), defaultEditorTheme, keybindings);
		let hints = 0;
		editor.onPasteHint = () => {
			hints++;
		};

		// Kitty release event for Ctrl+V: codepoint 118, ctrl modifier (5), release (3)
		expect(editor.onKeyRelease("\x1b[118;5:3u")).toBe(true);
		expect(hints).toBe(1);

		// Unrelated releases are not consumed and do not hint
		expect(editor.onKeyRelease("\x1b[97;1:3u")).toBe(false);
		expect(hints).toBe(1);

		// An empty bracketed paste (WT <= 1.24) also fires the hint
		editor.handleInput("\x1b[200~\x1b[201~");
		expect(hints).toBe(2);

		// A non-empty paste is plain text, not a hint
		editor.handleInput("\x1b[200~text\x1b[201~");
		expect(hints).toBe(2);
		expect(editor.getText()).toBe("text");
	});
});
