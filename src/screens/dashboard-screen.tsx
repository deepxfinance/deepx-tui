import process from 'node:process';
import { Box, Text, useApp, useInput } from 'ink';
import type { FC, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { CandleChart } from '../components/chart/candle-chart';
import { OrderbookPanel } from '../components/orderbook-panel';
import type { NetworkConfig } from '../config/networks';
import {
  appendChatMessage,
  type ChatMessage,
  getChatLoadingSegments,
  getVisibleChatMessages,
} from '../lib/dashboard-chat';
import {
  buildCommandPaletteItems,
  buildPairPickerItems,
  formatNetworkLine,
  formatShellComposerLine,
  isSlashCommandInput,
  moveSelectionIndex,
  parseShellInput,
  type ShellCommand,
} from '../lib/dashboard-input';
import { formatErrorMessage } from '../lib/error-format';
import {
  type AgentContinuation,
  type AgentStagedOrder,
  buildCancelledAgentActionResult,
  continueAgentChatAfterUserAction,
  executeConfirmedAgentAction,
  type PendingAgentAction,
  requestAgentChatWithActions,
} from '../services/agent-chat';
import {
  isTradeCancellationMessage,
  isTradeConfirmationMessage,
  type ParsedChatTradeIntent,
} from '../services/chat-trade-intent';
import { logError, logInfo } from '../services/logger';
import type { MarketPair, PairKind } from '../services/market-catalog';
import { placeOrderTool } from '../services/order-tools';
import { useMarketData } from '../services/use-market-data';
import { getRememberedWalletPassphrase } from '../services/wallet-session';
import { buildHelpLines, HelpContent } from './help-screen';

type DashboardScreenProps = {
  mode: 'default' | 'debug';
  network: NetworkConfig;
  walletAddress?: string;
  walletUnlocked: boolean;
};

type ShellMode = 'chat' | 'pair-select';

type OutputView =
  | { kind: 'empty' }
  | { kind: 'help' }
  | { kind: 'candle' }
  | { kind: 'orderbook' };

type DashboardLayoutSlotsInput = {
  shellMode: ShellMode;
  pendingCommand?: Exclude<ShellCommand, 'help'>;
  isCommandPaletteVisible: boolean;
  hasPendingTransactionConfirmation: boolean;
  hasPendingAgentAction: boolean;
  outputView: OutputView;
};

type DashboardLayoutSlots = {
  showPairPicker: boolean;
  showOutputView: boolean;
  showCommandPaletteBelowInput: boolean;
  showTransactionConfirmationBelowInput: boolean;
  showAgentActionBelowInput: boolean;
};

const UP_COLOR = '#28DE9C';
const DOWN_COLOR = '#FF3131';
const CHAT_USER_COLOR = '#FFD166';
const CHAT_ASSISTANT_COLOR = '#7FDBFF';
const CHAT_ASSISTANT_LABEL_COLOR = '#D7E3F4';
const CHAT_ASSISTANT_LINK_COLOR = '#AAB6FF';
const WELCOME_LOGO_COLOR = '#34FFAD';
const WELCOME_LOGO_IDLE_COLOR = '#0F5C41';
const WELCOME_LOGO_GUIDE_COLOR = '#335C4D';
const WELCOME_LOGO_ANIMATION_INTERVAL_MS = 30;
const WELCOME_LOGO_BLINK_FRAMES = 4;
const CHAT_LOADING_ANIMATION_INTERVAL_MS = 80;
const COMMAND_TEXT_COLOR = 'gray';
const COMMAND_HIGHLIGHT_COLOR = '#AAB6FF';
const TRANSACTION_CONFIRMATION_ITEMS = [
  {
    action: 'confirm',
    label: 'Confirm',
    description: 'send transaction',
  },
  {
    action: 'cancel',
    label: 'Cancel',
    description: 'keep staged only',
  },
] as const;
type TransactionConfirmationAction =
  (typeof TRANSACTION_CONFIRMATION_ITEMS)[number]['action'];
type AgentActionInputMode = 'selector' | 'passphrase';
export const WELCOME_LOGO_LINES = [
  { key: 'logo-1', line: '● ● ● ● ● ● · · · · ● ● ● ● ● ●' },
  { key: 'logo-2', line: '· · ● ● ● ● ● · · ● ● ● ● ● · ·' },
  { key: 'logo-3', line: '· · · · · ● ● ● ● ● ● · · · · ·' },
  { key: 'logo-4', line: '· · ● ● ● ● ● · · ● ● ● ● ● · ·' },
  { key: 'logo-5', line: '● ● ● ● ● ● · · · · ● ● ● ● ● ●' },
] as const;

type WelcomeLogoSegment = {
  key: string;
  character: string;
  color: string;
  bold?: boolean;
};

type WelcomeLogoFrame = {
  key: string;
  segments: WelcomeLogoSegment[];
};

const WELCOME_LOGO_SEQUENCE = WELCOME_LOGO_LINES.flatMap((entry, rowIndex) =>
  entry.line
    .split(' ')
    .flatMap((character, columnIndex) =>
      character === '●' ? [{ rowIndex, columnIndex }] : [],
    ),
);

const WELCOME_LOGO_DOT_COUNT = WELCOME_LOGO_SEQUENCE.length;
const WELCOME_LOGO_TOTAL_ANIMATION_FRAMES =
  WELCOME_LOGO_DOT_COUNT + WELCOME_LOGO_BLINK_FRAMES;

export function getWelcomeLogoFrames(activeDots: number): WelcomeLogoFrame[] {
  const clampedActiveDots = Math.max(0, activeDots);
  const blinkPhase = Math.max(0, clampedActiveDots - WELCOME_LOGO_DOT_COUNT);
  const isBlinkOffPhase = blinkPhase > 0 && blinkPhase % 2 === 1;
  const displayActiveDots = isBlinkOffPhase
    ? 0
    : Math.min(clampedActiveDots, WELCOME_LOGO_DOT_COUNT);
  const activeDotKeys = new Set(
    WELCOME_LOGO_SEQUENCE.slice(0, displayActiveDots).map(
      ({ rowIndex, columnIndex }) => `${rowIndex}-${columnIndex}`,
    ),
  );

  return WELCOME_LOGO_LINES.map((entry, rowIndex) => ({
    key: entry.key,
    segments: entry.line
      .split(' ')
      .flatMap((character, columnIndex, columns) => {
        const isLargeDot = character === '●';
        const segment: WelcomeLogoSegment = isLargeDot
          ? isBlinkOffPhase
            ? {
                key: `${entry.key}-${columnIndex}`,
                character: '·',
                color: WELCOME_LOGO_GUIDE_COLOR,
              }
            : activeDotKeys.has(`${rowIndex}-${columnIndex}`)
              ? {
                  key: `${entry.key}-${columnIndex}`,
                  character,
                  color: WELCOME_LOGO_COLOR,
                  bold: true,
                }
              : {
                  key: `${entry.key}-${columnIndex}`,
                  character,
                  color: WELCOME_LOGO_IDLE_COLOR,
                }
          : {
              key: `${entry.key}-${columnIndex}`,
              character,
              color: WELCOME_LOGO_GUIDE_COLOR,
            };

        return columnIndex < columns.length - 1
          ? [
              segment,
              {
                key: `${entry.key}-${columnIndex}-space`,
                character: ' ',
                color: segment.color,
              },
            ]
          : [segment];
      }),
  }));
}

export function getDashboardLayoutSlots(
  input: DashboardLayoutSlotsInput,
): DashboardLayoutSlots {
  const showPairPicker =
    input.shellMode === 'pair-select' && Boolean(input.pendingCommand);

  return {
    showPairPicker,
    showOutputView: input.outputView.kind !== 'empty',
    showCommandPaletteBelowInput:
      !showPairPicker && input.isCommandPaletteVisible,
    showTransactionConfirmationBelowInput:
      !showPairPicker &&
      !input.isCommandPaletteVisible &&
      !input.hasPendingAgentAction &&
      input.hasPendingTransactionConfirmation,
    showAgentActionBelowInput:
      !showPairPicker &&
      !input.isCommandPaletteVisible &&
      input.hasPendingAgentAction,
  };
}

export function getWorkspaceHeight(terminalRows?: number) {
  const resolvedRows = terminalRows ?? 40;
  return Math.max(resolvedRows - 18, 22);
}

export function getInitialOutputView(_mode: 'default' | 'debug'): OutputView {
  return { kind: 'empty' };
}

export const DashboardScreen: FC<DashboardScreenProps> = ({
  mode,
  network,
  walletAddress,
  walletUnlocked,
}) => {
  const { exit } = useApp();
  const [pairKind, setPairKind] = useState<PairKind>('perp');
  const [pairIndex, setPairIndex] = useState(0);
  const [resolution, setResolution] = useState('15');
  const [inputValue, setInputValue] = useState('');
  const [shellMode, setShellMode] = useState<ShellMode>('chat');
  const [pairPickerIndex, setPairPickerIndex] = useState(0);
  const [pendingCommand, setPendingCommand] = useState<
    Exclude<ShellCommand, 'help'> | undefined
  >();
  const [outputView, setOutputView] = useState<OutputView>(() =>
    getInitialOutputView(mode),
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => []);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatLoadingFrame, setChatLoadingFrame] = useState(0);
  const [pendingChatTrade, setPendingChatTrade] =
    useState<ParsedChatTradeIntent>();
  const [transactionConfirmationIndex, setTransactionConfirmationIndex] =
    useState(0);
  const [pendingAgentAction, setPendingAgentAction] =
    useState<PendingAgentAction>();
  const [pendingAgentContinuation, setPendingAgentContinuation] =
    useState<AgentContinuation>();
  const [agentActionSelectionIndex, setAgentActionSelectionIndex] = useState(0);
  const [agentActionInputMode, setAgentActionInputMode] =
    useState<AgentActionInputMode>('selector');
  const [agentActionPassphrase, setAgentActionPassphrase] = useState('');

  const {
    pairGroups,
    currentPair,
    overview,
    candles,
    orderbook,
    trades,
    isOrderbookConnected,
    candleStreamStatus,
    candleError,
    orderbookError,
  } = useMarketData({
    network,
    pairKind,
    pairIndex,
    resolution,
  });

  const currentOverview = overview[currentPair.label];
  const activePrice =
    currentOverview?.latestPrice ?? Number(orderbook?.latestPrice ?? 0);
  const priceLabel =
    activePrice > 0 ? activePrice.toFixed(currentPair.priceDecimal) : '--';
  const resolutionLabel = formatResolution(resolution);
  const visibleChatMessages = useMemo(
    () => getVisibleChatMessages(chatMessages, 8),
    [chatMessages],
  );
  const pairOptions = useMemo(
    () => [...pairGroups.perp, ...pairGroups.spot],
    [pairGroups.perp, pairGroups.spot],
  );
  const pairPickerItems = useMemo(
    () => buildPairPickerItems(pairOptions),
    [pairOptions],
  );
  const commandPaletteItems = useMemo(
    () => buildCommandPaletteItems(inputValue),
    [inputValue],
  );
  const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);
  const isCommandPaletteVisible =
    shellMode === 'chat' &&
    isSlashCommandInput(inputValue) &&
    commandPaletteItems.length > 0;
  const isTransactionConfirmationVisible =
    shellMode === 'chat' &&
    Boolean(pendingChatTrade) &&
    !isCommandPaletteVisible &&
    !pendingAgentAction &&
    !isChatLoading;
  const isAgentActionVisible =
    shellMode === 'chat' &&
    Boolean(pendingAgentAction) &&
    !isCommandPaletteVisible &&
    !isChatLoading;

  useEffect(() => {
    if (!isChatLoading) {
      setChatLoadingFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setChatLoadingFrame((value) => value + 1);
    }, CHAT_LOADING_ANIMATION_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isChatLoading]);

  useEffect(() => {
    setCommandPaletteIndex((current) => {
      if (commandPaletteItems.length === 0) {
        return 0;
      }

      return Math.min(current, commandPaletteItems.length - 1);
    });
  }, [commandPaletteItems]);

  useInput((input, key) => {
    if (input === 'q' && shellMode === 'chat') {
      exit();
      return;
    }

    if (shellMode === 'pair-select') {
      if (key.escape) {
        setPendingCommand(undefined);
        setPairPickerIndex(0);
        setShellMode('chat');
        return;
      }

      if (key.upArrow) {
        setPairPickerIndex((current) =>
          moveSelectionIndex(current, pairOptions.length, -1),
        );
        return;
      }

      if (key.downArrow) {
        setPairPickerIndex((current) =>
          moveSelectionIndex(current, pairOptions.length, 1),
        );
        return;
      }

      if (key.return) {
        const nextPair = pairOptions[pairPickerIndex];
        if (nextPair && pendingCommand) {
          activatePair(nextPair);
          setOutputView({ kind: pendingCommand });
          setChatMessages((messages) =>
            appendChatMessage(
              appendChatMessage(messages, 'command', `/${pendingCommand}`),
              'command',
              `└ ${nextPair.label}`,
            ),
          );
        }
        setPendingCommand(undefined);
        setPairPickerIndex(0);
        setShellMode('chat');
        return;
      }

      return;
    }

    if (isCommandPaletteVisible) {
      if (key.upArrow) {
        setCommandPaletteIndex((current) =>
          moveSelectionIndex(current, commandPaletteItems.length, -1),
        );
        return;
      }

      if (key.downArrow) {
        setCommandPaletteIndex((current) =>
          moveSelectionIndex(current, commandPaletteItems.length, 1),
        );
        return;
      }

      if (key.return) {
        const selectedItem = commandPaletteItems[commandPaletteIndex];
        if (selectedItem) {
          submitShellCommand(selectedItem.command);
        }
        return;
      }
    }

    if (isAgentActionVisible) {
      if (agentActionInputMode === 'passphrase') {
        if (key.return) {
          void submitPendingAgentAction('confirm');
          return;
        }

        if (key.escape) {
          void submitPendingAgentAction('cancel');
          return;
        }

        if (key.backspace || key.delete) {
          setAgentActionPassphrase((value) => value.slice(0, -1));
          return;
        }

        if (!key.ctrl && !key.meta && input.length > 0) {
          setAgentActionPassphrase((value) => `${value}${input}`);
          return;
        }

        return;
      }

      if (key.leftArrow || key.upArrow) {
        setAgentActionSelectionIndex((current) =>
          moveSelectionIndex(
            current,
            TRANSACTION_CONFIRMATION_ITEMS.length,
            -1,
          ),
        );
        return;
      }

      if (key.rightArrow || key.downArrow) {
        setAgentActionSelectionIndex((current) =>
          moveSelectionIndex(current, TRANSACTION_CONFIRMATION_ITEMS.length, 1),
        );
        return;
      }

      if (key.return && inputValue.trim().length === 0) {
        const selectedItem =
          TRANSACTION_CONFIRMATION_ITEMS[agentActionSelectionIndex];
        if (selectedItem) {
          void submitPendingAgentAction(selectedItem.action);
        }
        return;
      }

      if (key.escape && inputValue.trim().length === 0) {
        void submitPendingAgentAction('cancel');
        return;
      }
    }

    if (isTransactionConfirmationVisible) {
      if (key.leftArrow || key.upArrow) {
        setTransactionConfirmationIndex((current) =>
          moveSelectionIndex(
            current,
            TRANSACTION_CONFIRMATION_ITEMS.length,
            -1,
          ),
        );
        return;
      }

      if (key.rightArrow || key.downArrow) {
        setTransactionConfirmationIndex((current) =>
          moveSelectionIndex(current, TRANSACTION_CONFIRMATION_ITEMS.length, 1),
        );
        return;
      }

      if (key.return && inputValue.trim().length === 0) {
        const selectedItem =
          TRANSACTION_CONFIRMATION_ITEMS[transactionConfirmationIndex];
        if (selectedItem) {
          void submitTransactionConfirmation(selectedItem.action);
        }
        return;
      }

      if (key.escape && inputValue.trim().length === 0) {
        void submitTransactionConfirmation('cancel');
        return;
      }
    }

    if (key.return) {
      void handleSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      setInputValue((value) => value.slice(0, -1));
      return;
    }

    if (key.escape) {
      setInputValue('');
      return;
    }

    if (input === '[' && outputView.kind === 'candle') {
      setResolution((value) => rotateResolution(value, -1));
      return;
    }

    if (input === ']' && outputView.kind === 'candle') {
      setResolution((value) => rotateResolution(value, 1));
      return;
    }

    if (!key.ctrl && !key.meta && input.length > 0) {
      if (
        inputValue.length === 0 &&
        (outputView.kind === 'candle' || outputView.kind === 'orderbook')
      ) {
        setOutputView({ kind: 'empty' });
      }
      setInputValue((value) => `${value}${input}`);
    }
  });

  async function handleSubmit() {
    const parsed = parseShellInput(inputValue);
    if (!parsed || isChatLoading) {
      return;
    }

    if (parsed.kind === 'command') {
      submitShellCommand(parsed.command);
      return;
    }

    setInputValue('');
    const content = parsed.message;
    const nextMessages = appendChatMessage(chatMessages, 'user', content);
    setChatMessages(nextMessages);
    setIsChatLoading(true);

    try {
      if (pendingChatTrade && isTradeConfirmationMessage(content)) {
        await submitPendingChatTrade(pendingChatTrade);
        return;
      }

      if (pendingChatTrade && isTradeCancellationMessage(content)) {
        setPendingChatTrade(undefined);
        setTransactionConfirmationIndex(0);
        setChatMessages((messages) =>
          appendChatMessage(messages, 'assistant', 'Transaction cancelled.'),
        );
        return;
      }

      const agentResult = await requestAgentChatWithActions({
        messages: nextMessages,
        context: {
          network: network.id,
          pairLabel: currentPair.label,
          priceLabel,
          resolutionLabel,
          walletUnlocked,
        },
      });
      if (agentResult.kind === 'needs_user_action') {
        setPendingAgentAction(agentResult.action);
        setPendingAgentContinuation(agentResult.continuation);
        setAgentActionSelectionIndex(0);
        setAgentActionInputMode('selector');
        setAgentActionPassphrase('');
        setChatMessages((messages) =>
          appendChatMessage(
            messages,
            'assistant',
            [
              agentResult.action.title,
              ...agentResult.action.summaryLines,
              'Choose Confirm or Cancel below the input bar.',
            ].join('\n'),
          ),
        );
        return;
      }

      setChatMessages((messages) =>
        appendChatMessage(messages, 'assistant', agentResult.reply),
      );
      if (agentResult.stagedOrder) {
        setPendingChatTrade(
          buildChatTradeIntentFromAgentOrder(agentResult.stagedOrder),
        );
        setTransactionConfirmationIndex(0);
      }
    } catch (error) {
      logError('shell', 'Chat submit failed', formatErrorMessage(error));
      setChatMessages((messages) =>
        appendChatMessage(
          messages,
          'assistant',
          pendingChatTrade
            ? `Order failed: ${formatErrorMessage(error)}`
            : `Agent error: ${formatErrorMessage(error)}`,
        ),
      );
      setPendingChatTrade(undefined);
      setTransactionConfirmationIndex(0);
    } finally {
      setIsChatLoading(false);
    }
  }

  async function submitTransactionConfirmation(
    action: TransactionConfirmationAction,
  ) {
    if (!pendingChatTrade || isChatLoading) {
      return;
    }

    const content = action === 'confirm' ? 'Confirm' : 'Cancel';
    const nextMessages = appendChatMessage(chatMessages, 'user', content);
    setInputValue('');
    setChatMessages(nextMessages);

    if (action === 'cancel') {
      setPendingChatTrade(undefined);
      setTransactionConfirmationIndex(0);
      setChatMessages((messages) =>
        appendChatMessage(messages, 'assistant', 'Transaction cancelled.'),
      );
      return;
    }

    setIsChatLoading(true);
    await submitPendingChatTrade(pendingChatTrade);
  }

  async function submitPendingAgentAction(
    action: TransactionConfirmationAction,
  ) {
    if (!pendingAgentAction || !pendingAgentContinuation || isChatLoading) {
      return;
    }

    if (action === 'confirm') {
      const sessionPassphrase = getRememberedWalletPassphrase(network.id);
      if (
        pendingAgentAction.requiresPassphrase &&
        !sessionPassphrase &&
        agentActionInputMode !== 'passphrase'
      ) {
        setAgentActionInputMode('passphrase');
        setAgentActionPassphrase('');
        return;
      }
    }

    const userContent = action === 'confirm' ? 'Confirm' : 'Cancel';
    setInputValue('');
    setChatMessages((messages) =>
      appendChatMessage(messages, 'user', userContent),
    );
    setIsChatLoading(true);

    try {
      const actionResult =
        action === 'confirm'
          ? await executeConfirmedAgentAction({
              action: pendingAgentAction,
              defaultNetwork: network.id,
              passphrase:
                getRememberedWalletPassphrase(network.id) ??
                agentActionPassphrase.trim(),
            })
          : buildCancelledAgentActionResult(pendingAgentAction);
      const agentResult = await continueAgentChatAfterUserAction({
        continuation: pendingAgentContinuation,
        actionResult,
      });
      clearPendingAgentAction();

      if (agentResult.kind === 'needs_user_action') {
        setPendingAgentAction(agentResult.action);
        setPendingAgentContinuation(agentResult.continuation);
        setChatMessages((messages) =>
          appendChatMessage(
            messages,
            'assistant',
            [
              agentResult.action.title,
              ...agentResult.action.summaryLines,
              'Choose Confirm or Cancel below the input bar.',
            ].join('\n'),
          ),
        );
        return;
      }

      setChatMessages((messages) =>
        appendChatMessage(messages, 'assistant', agentResult.reply),
      );
      if (agentResult.stagedOrder) {
        setPendingChatTrade(
          buildChatTradeIntentFromAgentOrder(agentResult.stagedOrder),
        );
        setTransactionConfirmationIndex(0);
      }
    } catch (error) {
      logError('shell', 'Agent action failed', formatErrorMessage(error));
      clearPendingAgentAction();
      setChatMessages((messages) =>
        appendChatMessage(
          messages,
          'assistant',
          `Agent error: ${formatErrorMessage(error)}`,
        ),
      );
    } finally {
      setIsChatLoading(false);
    }
  }

  function clearPendingAgentAction() {
    setPendingAgentAction(undefined);
    setPendingAgentContinuation(undefined);
    setAgentActionSelectionIndex(0);
    setAgentActionInputMode('selector');
    setAgentActionPassphrase('');
  }

  async function submitPendingChatTrade(trade: ParsedChatTradeIntent) {
    try {
      logInfo(
        'chat-trade',
        'Submitting staged order',
        `${trade.side} ${trade.size} ${trade.pair} ${trade.type}`,
      );
      const result = await placeOrderTool({
        network: network.id,
        pair: trade.pair,
        side: trade.side,
        type: trade.type,
        size: trade.size,
        price: trade.price,
        confirm: true,
      });
      setPendingChatTrade(undefined);
      setTransactionConfirmationIndex(0);
      setChatMessages((messages) =>
        appendChatMessage(messages, 'assistant', result.summary),
      );
    } catch (error) {
      logError('shell', 'Chat trade submit failed', formatErrorMessage(error));
      setPendingChatTrade(undefined);
      setTransactionConfirmationIndex(0);
      setChatMessages((messages) =>
        appendChatMessage(
          messages,
          'assistant',
          `Order failed: ${formatErrorMessage(error)}`,
        ),
      );
    } finally {
      setIsChatLoading(false);
    }
  }

  function activatePair(nextPair: MarketPair) {
    const nextPairKind = nextPair.kind;
    const nextPairIndex = pairGroups[nextPairKind].findIndex(
      (pair) => pair.label === nextPair.label,
    );
    setPairKind(nextPairKind);
    setPairIndex(nextPairIndex >= 0 ? nextPairIndex : 0);
  }

  function submitShellCommand(command: ShellCommand) {
    setInputValue('');
    setCommandPaletteIndex(0);
    setChatMessages((messages) =>
      appendChatMessage(messages, 'command', `/${command}`),
    );

    if (command === 'help') {
      setOutputView({ kind: 'help' });
      setChatMessages((messages) =>
        appendChatMessage(messages, 'command', '└ Help shown in workspace'),
      );
      return;
    }

    setPendingCommand(command);
    setPairPickerIndex(0);
    setShellMode('pair-select');
  }

  const frameWidth = Math.max(process.stdout.columns ?? 120, 100);
  const workspaceHeight = getWorkspaceHeight(process.stdout.rows);
  const layoutSlots = getDashboardLayoutSlots({
    shellMode,
    pendingCommand,
    isCommandPaletteVisible,
    hasPendingTransactionConfirmation: isTransactionConfirmationVisible,
    hasPendingAgentAction: isAgentActionVisible,
    outputView,
  });

  return (
    <Box flexDirection="column" width={frameWidth} paddingX={1}>
      <WelcomePanel
        mode={mode}
        network={network}
        walletAddress={walletAddress}
        walletUnlocked={walletUnlocked}
      />

      {visibleChatMessages.length > 0 || isChatLoading ? (
        <TranscriptSection>
          {visibleChatMessages.map((message) => (
            <Text
              key={message.id}
              color={
                message.role === 'assistant'
                  ? CHAT_ASSISTANT_COLOR
                  : message.role === 'command'
                    ? COMMAND_TEXT_COLOR
                    : CHAT_USER_COLOR
              }
            >
              {message.role === 'assistant'
                ? 'AI> '
                : message.role === 'command'
                  ? ''
                  : 'You> '}
              {message.role === 'command'
                ? renderCommandMessage(message.content)
                : message.role === 'assistant'
                  ? renderAssistantMessage(message.content)
                  : message.content}
            </Text>
          ))}
          {isChatLoading ? (
            <Text color={CHAT_ASSISTANT_COLOR}>
              AI&gt;{' '}
              {getChatLoadingSegments(chatLoadingFrame).map((segment) => (
                <Text
                  key={segment.key}
                  color={segment.color}
                  dimColor={segment.dimColor}
                  bold={segment.bold}
                >
                  {segment.text}
                </Text>
              ))}
            </Text>
          ) : null}
        </TranscriptSection>
      ) : null}

      {layoutSlots.showOutputView ? (
        <Box marginBottom={1}>
          {renderOutputView({
            outputView,
            currentPair,
            candles,
            candleError,
            candleStreamStatus,
            latestPrice: priceLabel,
            priceChange1h: currentOverview?.priceChange1h,
            priceChange24h: currentOverview?.priceChange24h,
            volume24h: currentOverview?.volume24h,
            orderbook,
            trades,
            isOrderbookConnected,
            orderbookError,
            resolution,
            resolutionLabel,
            width: frameWidth - 2,
            height: workspaceHeight,
          })}
        </Box>
      ) : null}

      <InputSection>{formatShellComposerLine(inputValue, true)}</InputSection>

      {layoutSlots.showCommandPaletteBelowInput ? (
        <Section title="Commands">
          <CommandPalette
            items={commandPaletteItems}
            selectedIndex={commandPaletteIndex}
          />
        </Section>
      ) : null}

      {layoutSlots.showTransactionConfirmationBelowInput ? (
        <Section title="Transaction">
          <TransactionConfirmationSelector
            items={TRANSACTION_CONFIRMATION_ITEMS}
            selectedIndex={transactionConfirmationIndex}
          />
        </Section>
      ) : null}

      {layoutSlots.showAgentActionBelowInput && pendingAgentAction ? (
        <Section title="Agent Action">
          <AgentActionPanel
            action={pendingAgentAction}
            mode={agentActionInputMode}
            passphraseValue={agentActionPassphrase}
            selectedIndex={agentActionSelectionIndex}
          />
        </Section>
      ) : null}

      {layoutSlots.showPairPicker ? (
        <Section title="Select Pair">
          <PairPicker items={pairPickerItems} selectedIndex={pairPickerIndex} />
        </Section>
      ) : null}

      <Text color="gray">
        {formatNetworkLine({
          networkLabel: network.label,
          walletAddress,
          walletUnlocked,
        })}
      </Text>
    </Box>
  );
};

type WelcomePanelProps = {
  mode: 'default' | 'debug';
  network: NetworkConfig;
  walletAddress?: string;
  walletUnlocked: boolean;
};

const WelcomePanel: FC<WelcomePanelProps> = ({
  mode,
  network,
  walletAddress,
  walletUnlocked,
}) => {
  const [activeLogoDots, setActiveLogoDots] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveLogoDots((current) => {
        if (current >= WELCOME_LOGO_TOTAL_ANIMATION_FRAMES) {
          clearInterval(timer);
          return current;
        }

        return current + 1;
      });
    }, WELCOME_LOGO_ANIMATION_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <Section title={`DeepX Terminal ${mode}`}>
      <Box>
        <Box flexDirection="column" marginRight={2}>
          {getWelcomeLogoFrames(activeLogoDots).map((entry) => (
            <Text key={entry.key}>
              {entry.segments.map((segment) => (
                <Text
                  key={segment.key}
                  color={segment.color}
                  bold={segment.bold}
                >
                  {segment.character}
                </Text>
              ))}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" justifyContent="center">
          <Text color="green">Welcome back.</Text>
          <Text color="gray">
            {walletUnlocked
              ? `Wallet ready on ${network.label}.`
              : `Read-only shell on ${network.label}. Press Esc on startup to skip wallet unlock/import.`}
          </Text>
          <Text color="gray">
            {walletAddress ? `Wallet: ${walletAddress}` : 'Wallet: not loaded'}
          </Text>
          <Text color="gray">Commands: /candle /orderbook /help</Text>
          <Text color="gray">
            Use Enter to submit. Use Esc to leave pair selection.
          </Text>
        </Box>
      </Box>
    </Section>
  );
};

type SectionProps = {
  title: string;
  children: ReactNode;
};

const Section: FC<SectionProps> = ({ title, children }) => {
  return (
    <Box
      borderStyle="round"
      borderColor="gray"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      marginBottom={1}
    >
      <Text color="gray">{title}</Text>
      {children}
    </Box>
  );
};

type TranscriptSectionProps = {
  children: ReactNode;
};

const TranscriptSection: FC<TranscriptSectionProps> = ({ children }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {children}
    </Box>
  );
};

type InputSectionProps = {
  children: string;
};

const InputSection: FC<InputSectionProps> = ({ children }) => {
  return (
    <Box flexDirection="column">
      <Text color="gray">
        {'─'.repeat(Math.max((process.stdout.columns ?? 120) - 2, 20))}
      </Text>
      <Text color="yellow">{children}</Text>
      <Text color="gray">
        {'─'.repeat(Math.max((process.stdout.columns ?? 120) - 2, 20))}
      </Text>
    </Box>
  );
};

type PairPickerProps = {
  items: Array<{ label: string; description: string }>;
  selectedIndex: number;
};

const PairPicker: FC<PairPickerProps> = ({ items, selectedIndex }) => {
  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Text
          key={`${item.label}-${item.description}`}
          color={index === selectedIndex ? 'black' : 'white'}
          backgroundColor={index === selectedIndex ? 'yellow' : undefined}
        >
          {`${index === selectedIndex ? '>' : ' '} ${item.label}  ${item.description}`}
        </Text>
      ))}
      <Text color="gray">
        Up/Down move. Enter confirms. Esc returns to input.
      </Text>
    </Box>
  );
};

type CommandPaletteProps = {
  items: Array<{ label: string; description: string }>;
  selectedIndex: number;
};

const CommandPalette: FC<CommandPaletteProps> = ({ items, selectedIndex }) => {
  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Text
          key={item.label}
          color={index === selectedIndex ? '#AAB6FF' : 'gray'}
          bold={index === selectedIndex}
        >
          {`${index === selectedIndex ? '>' : ' '} ${item.label.padEnd(12)} ${item.description}`}
        </Text>
      ))}
      <Text color="gray">Up/Down move. Enter confirms. Esc clears.</Text>
    </Box>
  );
};

type TransactionConfirmationSelectorProps = {
  items: typeof TRANSACTION_CONFIRMATION_ITEMS;
  selectedIndex: number;
};

const TransactionConfirmationSelector: FC<
  TransactionConfirmationSelectorProps
> = ({ items, selectedIndex }) => {
  return (
    <Box flexDirection="column">
      <Box>
        {items.map((item, index) => (
          <Text
            key={item.action}
            color={index === selectedIndex ? 'black' : 'white'}
            backgroundColor={index === selectedIndex ? 'yellow' : undefined}
          >
            {`${index === selectedIndex ? '>' : ' '} ${item.label}  `}
          </Text>
        ))}
      </Box>
      <Text color="gray">
        {
          'Left/Right move. Enter selects. Esc cancels. Typing confirm or cancel still works.'
        }
      </Text>
    </Box>
  );
};

type AgentActionPanelProps = {
  action: PendingAgentAction;
  mode: AgentActionInputMode;
  passphraseValue: string;
  selectedIndex: number;
};

const AgentActionPanel: FC<AgentActionPanelProps> = ({
  action,
  mode,
  passphraseValue,
  selectedIndex,
}) => {
  if (mode === 'passphrase') {
    return (
      <Box flexDirection="column">
        <Text color="white">{action.title}</Text>
        {action.summaryLines.map((line) => (
          <Text key={line} color="gray">
            {line}
          </Text>
        ))}
        <Text color="yellow">{`> ${'*'.repeat(passphraseValue.length)}█`}</Text>
        <Text color="gray">
          Enter submits with this passphrase. Esc cancels.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="white">{action.title}</Text>
      {action.summaryLines.map((line) => (
        <Text key={line} color="gray">
          {line}
        </Text>
      ))}
      <Box>
        {TRANSACTION_CONFIRMATION_ITEMS.map((item, index) => (
          <Text
            key={item.action}
            color={index === selectedIndex ? 'black' : 'white'}
            backgroundColor={index === selectedIndex ? 'yellow' : undefined}
          >
            {`${index === selectedIndex ? '>' : ' '} ${
              item.action === 'confirm'
                ? action.confirmLabel
                : action.cancelLabel
            }  `}
          </Text>
        ))}
      </Box>
      <Text color="gray">Left/Right move. Enter selects. Esc cancels.</Text>
    </Box>
  );
};

function renderOutputView(input: {
  outputView: OutputView;
  currentPair: MarketPair;
  candles: Parameters<typeof CandleChart>[0]['candles'];
  candleError?: string;
  candleStreamStatus: Parameters<typeof CandleChart>[0]['streamStatus'];
  latestPrice: string;
  priceChange1h?: number;
  priceChange24h?: number;
  volume24h?: number;
  orderbook: {
    orderSellList?: { price: string; qty: string; value: string }[];
    orderBuyList?: { price: string; qty: string; value: string }[];
  } | null;
  trades: Array<{
    price: string | number;
    qty?: string | number;
    filledQty?: string | number;
    amount?: string | number;
    size?: string | number;
    filledDirection?: string;
    isLong?: boolean;
    createdAt?: string;
    time?: string | number;
  }>;
  isOrderbookConnected: boolean;
  orderbookError?: string;
  resolution: string;
  resolutionLabel: string;
  width: number;
  height: number;
}) {
  if (input.outputView.kind === 'help') {
    return <HelpContent lines={buildHelpLines('deepx')} />;
  }

  if (input.outputView.kind === 'orderbook') {
    return (
      <OrderbookPanel
        errorMessage={input.orderbookError}
        isConnected={input.isOrderbookConnected}
        latestPrice={input.latestPrice}
        priceChange1h={input.priceChange1h}
        priceChange24h={input.priceChange24h}
        volume24h={input.volume24h}
        orderbook={input.orderbook}
        pairLabel={input.currentPair.label}
        trades={input.trades}
      />
    );
  }

  if (input.outputView.kind === 'candle') {
    return (
      <Box flexDirection="column">
        <CandleChart
          candles={input.candles}
          changeColor={UP_COLOR}
          changeLabel=""
          height={Math.max(input.height - 3, 8)}
          lastPriceLabel={input.latestPrice}
          pairLabel={input.currentPair.label}
          resolution={input.resolution}
          resolutionLabel={input.resolutionLabel}
          streamStatus={input.candleStreamStatus}
          width={Math.max(input.width - 4, 40)}
        />
        {input.candleError ? (
          <Text color={DOWN_COLOR}>{input.candleError}</Text>
        ) : null}
      </Box>
    );
  }
  return null;
}

function formatResolution(resolution: string) {
  if (resolution === '1D' || resolution === '1W' || resolution === '1M') {
    return resolution;
  }

  return `${resolution}m`;
}

function rotateResolution(current: string, direction: -1 | 1) {
  const resolutions = ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'];
  const currentIndex = resolutions.indexOf(current);
  const nextIndex =
    (currentIndex + direction + resolutions.length) % resolutions.length;
  return resolutions[nextIndex] ?? '15';
}

function buildChatTradeIntentFromAgentOrder(
  order: AgentStagedOrder,
): ParsedChatTradeIntent {
  return {
    pair: order.pair,
    side: order.side,
    type: order.type,
    size: order.size,
    price: order.type === 'LIMIT' ? order.price : undefined,
    baseAsset: order.pair.split(/[-/]/)[0]?.trim().toUpperCase() ?? '',
  };
}

export function getCommandMessageSegments(content: string) {
  if (!content.startsWith('/')) {
    return [{ text: content, color: COMMAND_TEXT_COLOR }];
  }

  const firstSpaceIndex = content.indexOf(' ');
  const commandToken =
    firstSpaceIndex >= 0 ? content.slice(0, firstSpaceIndex) : content;
  const remainder = firstSpaceIndex >= 0 ? content.slice(firstSpaceIndex) : '';

  return [
    { text: '/', color: COMMAND_TEXT_COLOR },
    { text: commandToken.slice(1), color: COMMAND_HIGHLIGHT_COLOR },
    ...(remainder ? [{ text: remainder, color: COMMAND_TEXT_COLOR }] : []),
  ];
}

function renderCommandMessage(content: string) {
  return getCommandMessageSegments(content).map((segment) => (
    <Text key={`${segment.color}-${segment.text}`} color={segment.color}>
      {segment.text}
    </Text>
  ));
}

export function getAssistantMessageSegments(content: string) {
  const pattern =
    /(https?:\/\/\S+|BUY|SELL|Order submitted|Status:|Side:|Pair:|Type:|Size:|Price:|Tx Hash:|Explorer:)/g;
  const parts = content.split(pattern).filter((part) => part.length > 0);

  return parts.map((part, index) => ({
    key: `assistant-${index}-${part}`,
    text: part,
    color: getAssistantMessageColor(part),
  }));
}

function renderAssistantMessage(content: string) {
  return getAssistantMessageSegments(content).map((segment) => (
    <Text key={segment.key} color={segment.color}>
      {segment.text}
    </Text>
  ));
}

function getAssistantMessageColor(part: string) {
  if (part === 'BUY') {
    return UP_COLOR;
  }

  if (part === 'SELL') {
    return DOWN_COLOR;
  }

  if (part === 'Order submitted') {
    return 'green';
  }

  if (
    part === 'Status:' ||
    part === 'Side:' ||
    part === 'Pair:' ||
    part === 'Type:' ||
    part === 'Size:' ||
    part === 'Price:' ||
    part === 'Tx Hash:' ||
    part === 'Explorer:'
  ) {
    return CHAT_ASSISTANT_LABEL_COLOR;
  }

  if (part.startsWith('http://') || part.startsWith('https://')) {
    return CHAT_ASSISTANT_LINK_COLOR;
  }

  return CHAT_ASSISTANT_COLOR;
}
