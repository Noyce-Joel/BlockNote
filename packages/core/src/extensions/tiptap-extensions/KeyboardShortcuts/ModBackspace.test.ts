import { describe, expect, it } from "vitest";

import { setupTestEnv } from "../../../api/blockManipulation/setupTestEnv.js";

const getEditor = setupTestEnv();

// tiptap's always-on `keymap` core extension also binds Mod-Backspace/Mod-Delete
// to its *generic* handlers. These tests assert that BlockNote's block-aware
// Mod-Backspace (added to KeyboardShortcutsExtension) wins and behaves like
// plain Backspace at the start of a block. "Mod" resolves to Cmd on macOS and
// Ctrl elsewhere — match the platform so the synthetic event hits the binding
// the keymap actually registered (the conflict resolution is platform-agnostic).
const isMac = /Mac|iP(hone|[oa]d)/.test(
  typeof navigator !== "undefined" ? navigator.platform : "",
);

function fireModBackspace() {
  const view = getEditor().prosemirrorView!;
  const event = new KeyboardEvent("keydown", {
    key: "Backspace",
    code: "Backspace",
    metaKey: isMac,
    ctrlKey: !isMac,
    bubbles: true,
    cancelable: true,
  });
  return view.someProp("handleKeyDown", (f) => f(view, event)) ?? false;
}

describe("Mod-Backspace keymap", () => {
  it("merges a non-empty block into the previous block", () => {
    getEditor().setTextCursorPosition("paragraph-1", "start");

    const handled = fireModBackspace();

    expect(handled).toBe(true);
    const block = getEditor().getBlock("paragraph-0");
    expect((block?.content as any)?.[0]?.text).toBe("Paragraph 0Paragraph 1");
    expect(getEditor().getBlock("paragraph-1")).toBeUndefined();
  });

  it("deletes an empty block (merge with previous)", () => {
    getEditor().setTextCursorPosition("empty-paragraph", "start");

    const handled = fireModBackspace();

    expect(handled).toBe(true);
    expect(getEditor().getBlock("empty-paragraph")).toBeUndefined();
  });

  it("is a safe no-op on the empty first block", () => {
    getEditor().replaceBlocks(getEditor().document, [
      { id: "only", type: "paragraph", content: "" },
    ]);
    getEditor().setTextCursorPosition("only", "start");

    // Must not throw "There is no position before the top-level node".
    expect(() => fireModBackspace()).not.toThrow();
    expect(getEditor().getBlock("only")).toBeDefined();
  });
});
