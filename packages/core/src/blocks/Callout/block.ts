import { ViewMutationRecord } from "@tiptap/pm/view";

import { BlockNoteEditor } from "../../editor/BlockNoteEditor.js";
import { createExtension } from "../../editor/BlockNoteExtension.js";
import { createBlockConfig, createBlockSpec } from "../../schema/index.js";
import { getBlockInfoFromSelection } from "../../api/getBlockInfoFromPos.js";
import { Block } from "../defaultBlocks.js";

const EMOJI_OPTIONS = [
  "💡", "⚠️", "❗", "ℹ️", "✅", "❌", "🔥", "⭐",
  "📌", "📝", "🎯", "💬", "🚀", "🛑", "💎", "🔔",
  "👉", "🏆", "❓", "🔗", "📢", "🧪", "🐛", "🔒",
  "⏳", "📦", "✏️", "📎", "🗂️", "🤔",
];

function createCalloutIconPicker(
  block: Block<any, any, any>,
  editor: BlockNoteEditor<any, any, any>,
): {
  dom: HTMLElement;
  ignoreMutation: (mutation: ViewMutationRecord) => boolean;
  destroy: () => void;
} {
  const dom = document.createElement("div");
  dom.className = "bn-callout-icon";
  dom.contentEditable = "false";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "bn-callout-icon-button";
  button.title = "Change icon";
  button.textContent = block.props.icon;
  dom.appendChild(button);

  const picker = document.createElement("div");
  picker.className = "bn-callout-emoji-picker";
  picker.style.display = "none";

  const grid = document.createElement("div");
  grid.className = "bn-callout-emoji-grid";
  picker.appendChild(grid);

  for (const emoji of EMOJI_OPTIONS) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "bn-callout-emoji-option";
    option.textContent = emoji;
    grid.appendChild(option);
  }

  dom.appendChild(picker);

  let open = false;

  const togglePicker = () => {
    if (!editor.isEditable) {
      return;
    }
    open = !open;
    picker.style.display = open ? "block" : "none";
  };

  const onButtonMouseDown = (e: MouseEvent) => e.preventDefault();
  const onButtonClick = () => togglePicker();

  button.addEventListener("mousedown", onButtonMouseDown);
  button.addEventListener("click", onButtonClick);

  const onGridClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("bn-callout-emoji-option")) {
      e.preventDefault();
      const emoji = target.textContent || "💡";
      button.textContent = emoji;
      editor.updateBlock(block, {
        props: { ...block.props, icon: emoji },
      });
      open = false;
      picker.style.display = "none";
    }
  };

  const onGridMouseDown = (e: MouseEvent) => e.preventDefault();

  grid.addEventListener("click", onGridClick);
  grid.addEventListener("mousedown", onGridMouseDown);

  const onDocMouseDown = (e: MouseEvent) => {
    if (open && !dom.contains(e.target as Node)) {
      open = false;
      picker.style.display = "none";
    }
  };

  document.addEventListener("mousedown", onDocMouseDown);

  return {
    dom,
    ignoreMutation: (mutation) => {
      if (mutation instanceof MutationRecord && dom.contains(mutation.target)) {
        return true;
      }
      return false;
    },
    destroy: () => {
      button.removeEventListener("mousedown", onButtonMouseDown);
      button.removeEventListener("click", onButtonClick);
      grid.removeEventListener("click", onGridClick);
      grid.removeEventListener("mousedown", onGridMouseDown);
      document.removeEventListener("mousedown", onDocMouseDown);
    },
  };
}

export type CalloutBlockConfig = ReturnType<typeof createCalloutBlockConfig>;

export const createCalloutBlockConfig = createBlockConfig(
  () =>
    ({
      type: "callout" as const,
      propSchema: {
        icon: { default: "💡" as const, type: "string" as const },
      },
      content: "none" as const,
    }) as const,
);

export const createCalloutBlockSpec = createBlockSpec(
  createCalloutBlockConfig,
  {
    render(block, editor) {
      const iconPicker = createCalloutIconPicker(block as any, editor);
      return {
        dom: iconPicker.dom,
        ignoreMutation: iconPicker.ignoreMutation,
        destroy: iconPicker.destroy,
      };
    },
    toExternalHTML(block) {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-callout-block", "");
      wrapper.setAttribute("data-callout-icon", block.props.icon);

      const icon = document.createElement("span");
      icon.className = "bn-callout-external-icon";
      icon.textContent = block.props.icon;
      wrapper.appendChild(icon);

      return { dom: wrapper };
    },
    parse(element) {
      if (element.hasAttribute("data-callout-block")) {
        return {
          icon: element.getAttribute("data-callout-icon") || "💡",
        };
      }

      return undefined;
    },
  },
  [
    createExtension({
      key: "callout-keyboard-shortcuts",
      keyboardShortcuts: {
        Backspace: ({ editor }) => handleCalloutBackspace(editor),
      },
    }),
  ],
);

function handleCalloutBackspace(
  editor: BlockNoteEditor<any, any, any>,
): boolean {
  const view = editor.prosemirrorView;
  if (!view) {
    return false;
  }

  const state = view.state;

  if (!state.selection.empty) {
    return false;
  }

  const blockInfo = getBlockInfoFromSelection(state);
  if (!blockInfo.isBlockContainer) {
    return false;
  }

  const selectionAtBlockStart =
    state.selection.from === blockInfo.blockContent.beforePos + 1;
  if (!selectionAtBlockStart) {
    return false;
  }

  const pos = editor.getTextCursorPosition();

  // Case 1: Cursor is at the start of the first child inside a callout.
  if (pos.parentBlock && pos.parentBlock.type === "callout") {
    const isFirstChild =
      pos.parentBlock.children.length > 0 &&
      pos.parentBlock.children[0].id === pos.block.id;

    if (!isFirstChild) {
      return false;
    }

    const blockIsEmpty = blockInfo.blockContent.node.childCount === 0;

    // Only child in callout and it's empty: block backspace to keep callout
    // intact with at least one child.
    if (pos.parentBlock.children.length === 1 && blockIsEmpty) {
      return true;
    }

    // First child is empty with siblings: delete it and move cursor to the
    // block before the callout (if any).
    if (blockIsEmpty) {
      editor.transact(() => {
        editor.removeBlocks([pos.block]);
      });
      if (pos.prevBlock) {
        editor.setTextCursorPosition(pos.prevBlock, "end");
      } else {
        editor.setTextCursorPosition(pos.parentBlock, "start");
      }
      return true;
    }

    // First child has content: move it out above the callout.
    editor.transact(() => {
      const block = editor.getBlock(pos.block)!;
      editor.insertBlocks([block], pos.parentBlock!, "before");
      editor.removeBlocks([pos.block]);
    });
    editor.setTextCursorPosition(pos.block, "start");
    return true;
  }

  // Case 2: Cursor at start of a block immediately AFTER a callout.
  // Move the current block into the callout as the last child.
  if (pos.prevBlock && pos.prevBlock.type === "callout") {
    const calloutBlock = pos.prevBlock;
    const currentBlock = pos.block;

    editor.transact(() => {
      const fullBlock = editor.getBlock(currentBlock)!;
      const lastChild = calloutBlock.children[calloutBlock.children.length - 1];

      if (lastChild) {
        editor.insertBlocks([fullBlock], lastChild, "after");
      } else {
        editor.updateBlock(calloutBlock, {
          children: [fullBlock],
        });
      }

      editor.removeBlocks([currentBlock]);
    });

    editor.setTextCursorPosition(currentBlock, "start");
    return true;
  }

  return false;
}
