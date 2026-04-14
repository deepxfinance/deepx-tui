import { Box, Text, useInput } from 'ink';
import type { FC } from 'react';
import { useEffect, useReducer } from 'react';
import {
  getHistoryValue,
  getNextWordIndex,
  getPrevWordIndex,
  insertCharAt,
  parseShellComposerParts,
  removeCharAt,
  removeLineAfter,
  removeLineBefore,
  removeWordAfter,
} from '../lib/dashboard-input';

type ShellInputProps = {
  onSubmit: (value: string) => void;
  onChange?: (value: string) => void;
  placeholder?: string;
  initialHistory?: string[];
};

type State = {
  value: string;
  cursor: number;
  history: string[];
  historyIndex: number | null;
  draft: string;
};

type Action =
  | { type: 'TYPE'; char: string }
  | { type: 'BACKSPACE' }
  | { type: 'DELETE'; isCtrl: boolean }
  | { type: 'MOVE_LEFT'; isCtrl: boolean }
  | { type: 'MOVE_RIGHT'; isCtrl: boolean }
  | { type: 'MOVE_UP' }
  | { type: 'MOVE_DOWN' }
  | { type: 'HOME' }
  | { type: 'END' }
  | { type: 'CLEAR_BEFORE' }
  | { type: 'CLEAR_AFTER' }
  | { type: 'RESET' }
  | { type: 'SYNC_HISTORY'; history: string[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'TYPE': {
      const newValue = insertCharAt(state.value, state.cursor, action.char);
      return {
        ...state,
        value: newValue,
        cursor: state.cursor + action.char.length,
      };
    }
    case 'BACKSPACE': {
      if (state.cursor > 0) {
        const newValue = removeCharAt(state.value, state.cursor, false);
        return { ...state, value: newValue, cursor: state.cursor - 1 };
      }
      return state;
    }
    case 'DELETE': {
      if (action.isCtrl) {
        const newValue = removeWordAfter(state.value, state.cursor);
        return { ...state, value: newValue };
      }
      const newValue = removeCharAt(state.value, state.cursor, true);
      return { ...state, value: newValue };
    }
    case 'MOVE_LEFT':
      return {
        ...state,
        cursor: action.isCtrl
          ? getPrevWordIndex(state.value, state.cursor)
          : Math.max(0, state.cursor - 1),
      };
    case 'MOVE_RIGHT':
      return {
        ...state,
        cursor: action.isCtrl
          ? getNextWordIndex(state.value, state.cursor)
          : Math.min(state.value.length, state.cursor + 1),
      };
    case 'MOVE_UP': {
      if (state.history.length === 0) return state;
      const { nextIndex, nextValue } = getHistoryValue(
        state.history,
        state.historyIndex,
        'up',
        state.historyIndex === null ? state.value : state.draft,
      );
      return {
        ...state,
        historyIndex: nextIndex,
        value: nextValue,
        cursor: nextValue.length,
        draft: state.historyIndex === null ? state.value : state.draft,
      };
    }
    case 'MOVE_DOWN': {
      if (state.history.length === 0) return state;
      const { nextIndex, nextValue } = getHistoryValue(
        state.history,
        state.historyIndex,
        'down',
        state.draft,
      );
      return {
        ...state,
        historyIndex: nextIndex,
        value: nextValue,
        cursor: nextValue.length,
      };
    }
    case 'HOME':
      return { ...state, cursor: 0 };
    case 'END':
      return { ...state, cursor: state.value.length };
    case 'CLEAR_BEFORE':
      return {
        ...state,
        value: removeLineBefore(state.value, state.cursor),
        cursor: 0,
      };
    case 'CLEAR_AFTER':
      return { ...state, value: removeLineAfter(state.value, state.cursor) };
    case 'RESET':
      return { ...state, value: '', cursor: 0, historyIndex: null, draft: '' };
    case 'SYNC_HISTORY':
      return { ...state, history: action.history };
    default:
      return state;
  }
}

export const ShellInput: FC<ShellInputProps> = ({
  onSubmit,
  onChange,
  placeholder = 'Type a message...',
  initialHistory = [],
}) => {
  const [state, dispatch] = useReducer(reducer, {
    value: '',
    cursor: 0,
    history: initialHistory,
    historyIndex: null,
    draft: '',
  });

  useEffect(() => {
    dispatch({ type: 'SYNC_HISTORY', history: initialHistory });
  }, [initialHistory]);

  useEffect(() => {
    if (onChange) onChange(state.value);
  }, [state.value, onChange]);

  useInput((input, key) => {
    const isCtrl = key.ctrl || key.meta;

    // Standard high-level flags from Ink 7.0.0
    const isBackspace =
      key.backspace || input === '\x7f' || input === '\x08' || input === '\b';
    const isDelete = key.delete || (isCtrl && input === 'd');

    if (key.upArrow) return dispatch({ type: 'MOVE_UP' });
    if (key.downArrow) return dispatch({ type: 'MOVE_DOWN' });

    if ((isCtrl && input === 'a') || (key as { home?: boolean }).home)
      return dispatch({ type: 'HOME' });
    if ((isCtrl && input === 'e') || (key as { end?: boolean }).end)
      return dispatch({ type: 'END' });

    if (key.leftArrow) return dispatch({ type: 'MOVE_LEFT', isCtrl });
    if (key.rightArrow) return dispatch({ type: 'MOVE_RIGHT', isCtrl });

    // Simple single-character backspace only to avoid Windows Terminal byte collision bugs
    if (isBackspace) return dispatch({ type: 'BACKSPACE' });
    if (isDelete) return dispatch({ type: 'DELETE', isCtrl });

    if (isCtrl && input === 'u') return dispatch({ type: 'CLEAR_BEFORE' });
    if (isCtrl && input === 'k') return dispatch({ type: 'CLEAR_AFTER' });

    if (key.return) {
      onSubmit(state.value);
      return dispatch({ type: 'RESET' });
    }

    if (key.escape) {
      return dispatch({ type: 'RESET' });
    }

    const isPrintable =
      !isCtrl &&
      !key.meta &&
      !isBackspace &&
      !isDelete &&
      input !== '\r' &&
      input !== '\n' &&
      input !== '\t' &&
      Array.from(input).every((char) => {
        const code = char.charCodeAt(0);
        return (code >= 32 && code <= 126) || code >= 160;
      });

    if (isPrintable) {
      dispatch({ type: 'TYPE', char: input });
    }
  });

  const { before, at, after } = parseShellComposerParts(
    state.value,
    state.cursor,
  );

  return (
    <Box>
      <Text color="yellow">{'> '}</Text>
      {!state.value ? (
        <Box>
          <Text inverse> </Text>
          <Text color="gray">{` ${placeholder}`}</Text>
        </Box>
      ) : (
        <Text color="yellow">
          <Text>{before}</Text>
          <Text inverse>{at || ' '}</Text>
          <Text>{after}</Text>
        </Text>
      )}
    </Box>
  );
};
