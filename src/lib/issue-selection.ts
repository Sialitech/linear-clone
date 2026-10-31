export type SelectionState = {
  selected: string[];
  anchorId: string | null;
};

export function selectionAfterClick(
  orderedIds: readonly string[],
  state: SelectionState,
  clickedId: string,
  modifiers: { shiftKey: boolean; toggleKey: boolean },
): SelectionState {
  const clickedIndex = orderedIds.indexOf(clickedId);
  if (clickedIndex < 0) return state;

  const anchorIndex = state.anchorId ? orderedIds.indexOf(state.anchorId) : -1;
  if (modifiers.shiftKey && anchorIndex >= 0) {
    const start = Math.min(anchorIndex, clickedIndex);
    const end = Math.max(anchorIndex, clickedIndex);
    const range = orderedIds.slice(start, end + 1);
    const selected = modifiers.toggleKey
      ? [...new Set([...state.selected, ...range])]
      : range;
    return { selected, anchorId: state.anchorId };
  }

  const selected = new Set(state.selected);
  if (selected.has(clickedId)) selected.delete(clickedId);
  else selected.add(clickedId);
  return { selected: [...selected], anchorId: clickedId };
}

export function selectionAfterSelectAll(orderedIds: readonly string[], allSelected: boolean): SelectionState {
  if (allSelected) return { selected: [], anchorId: null };
  return { selected: [...orderedIds], anchorId: orderedIds[0] ?? null };
}
