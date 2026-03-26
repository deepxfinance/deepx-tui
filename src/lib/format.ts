export function maskValue(value: string, visible = false): string {
  if (visible) {
    return value || '(empty)';
  }

  if (!value) {
    return '(empty)';
  }

  return '*'.repeat(value.length);
}

export function formatFocusedInputValue(
  value: string,
  isFocused: boolean,
): string {
  if (!isFocused) {
    return value;
  }

  if (value === '(empty)') {
    return `█ ${value}`;
  }

  return `${value}█`;
}

export function truncateMiddle(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 3) {
    return value;
  }

  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}

export function padRight(value: string, width: number): string {
  return value.length >= width
    ? value
    : `${value}${' '.repeat(width - value.length)}`;
}
