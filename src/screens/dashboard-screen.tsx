import process from 'node:process';
import { Box, Text, useApp, useInput } from 'ink';
import type { FC, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { CandleChart } from '../components/chart/candle-chart';
import { DebugPanel } from '../components/debug-panel';
import { PositionsPanel } from '../components/positions-panel';
import type { NetworkConfig } from '../config/networks';
import { CLI_VERSION } from '../lib/cli-version';
import {
  appendChatMessage,
  createInitialChatMessages,
  getChatLoadingMessage,
  getVisibleChatMessages,
} from '../lib/dashboard-chat';
import {
  cycleFocusTarget,
  type DashboardFocusTarget,
  formatChatComposerLine,
  getPairKindShortcut,
} from '../lib/dashboard-input';
import {
  formatWebSocketDelay,
  getWebSocketDelayTone,
} from '../lib/dashboard-status';
import { formatErrorMessage, formatErrorWithStack } from '../lib/error-format';
import { padRight, truncateMiddle } from '../lib/format';
import { requestAgentChat } from '../services/agent-chat';
import {
  buildTradeIntentConfirmationMessage,
  isTradeConfirmationMessage,
  type ParsedChatTradeIntent,
  parseChatTradeIntent,
} from '../services/chat-trade-intent';
import { logError, logInfo } from '../services/logger';
import type { PairKind } from '../services/market-catalog';
import { placeOrderTool } from '../services/order-tools';
import { useMarketData } from '../services/use-market-data';
import { useUserPerpPositions } from '../services/user-perp-positions';

type DashboardScreenProps = {
  mode: 'default' | 'debug';
  network: NetworkConfig;
  walletAddress: string;
};

type FocusTarget = DashboardFocusTarget;
const resolutions = ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'];
const UP_COLOR = '#28DE9C';
const DOWN_COLOR = '#FF3131';
const CHAT_USER_COLOR = '#FFD166';
const CHAT_ASSISTANT_COLOR = '#7FDBFF';
const PANEL_GAP = 0;
const CHAT_INPUT_HEIGHT = 3;
const TOP_BAR_HEIGHT = 6;
const FOOTER_HEIGHT = 3;
const BOTTOM_PANEL_HEIGHT = 8;
const FRAME_PADDING_Y = 1;

export const DashboardScreen: FC<DashboardScreenProps> = ({
  mode,
  network,
  walletAddress,
}) => {
  const { exit } = useApp();
  const [pairKind, setPairKind] = useState<PairKind>('perp');
  const [pairIndex, setPairIndex] = useState(0);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>('pairs');
  const [resolution, setResolution] = useState('15');
  const [chatInput, setChatInput] = useState('');
  const [debugFilter, setDebugFilter] = useState('');
  const [chatMessages, setChatMessages] = useState(createInitialChatMessages);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatLoadingFrame, setChatLoadingFrame] = useState(0);
  const [pendingChatTrade, setPendingChatTrade] =
    useState<ParsedChatTradeIntent>();
  const {
    pairGroups,
    activePair,
    overview,
    candles,
    orderbook,
    trades,
    isOverviewConnected,
    isOrderbookConnected,
    candleStreamStatus,
    candleError,
    orderbookError,
    websocketDelayMs,
  } = useMarketData({
    network,
    pairKind,
    pairIndex,
    resolution,
  });

  const activeOverview = overview[activePair.label];
  const perpPositions = useUserPerpPositions({
    network,
    walletAddress,
    perpPairs: pairGroups.perp,
  });
  const activePrice =
    activeOverview?.latestPrice ?? Number(orderbook?.latestPrice ?? 0);
  const priceLabel =
    activePrice > 0 ? activePrice.toFixed(activePair.priceDecimal) : '--';
  const change24h = activeOverview?.priceChange24h;
  const resolutionLabel = formatResolution(resolution);
  const visibleChatMessages = useMemo(
    () => getVisibleChatMessages(chatMessages, 6),
    [chatMessages],
  );

  useEffect(() => {
    if (!isChatLoading) {
      setChatLoadingFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setChatLoadingFrame((value) => value + 1);
    }, 250);

    return () => clearInterval(timer);
  }, [isChatLoading]);

  async function handleChatSubmit() {
    const content = chatInput.trim();
    if (!content || isChatLoading) {
      return;
    }

    const nextMessages = appendChatMessage(chatMessages, 'user', content);
    setChatMessages(nextMessages);
    setChatInput('');
    setIsChatLoading(true);

    try {
      if (pendingChatTrade && isTradeConfirmationMessage(content)) {
        logInfo(
          'chat-trade',
          'Submitting staged order',
          `${pendingChatTrade.side} ${pendingChatTrade.size} ${pendingChatTrade.pair} ${pendingChatTrade.type}`,
        );
        const result = await placeOrderTool({
          network: network.id,
          pair: pendingChatTrade.pair,
          side: pendingChatTrade.side,
          type: pendingChatTrade.type,
          size: pendingChatTrade.size,
          price: pendingChatTrade.price,
          confirm: true,
        });
        setPendingChatTrade(undefined);
        setChatMessages((messages) =>
          appendChatMessage(messages, 'assistant', result.summary),
        );
        logInfo('chat-trade', 'Order submitted', result.summary);
        return;
      }

      const tradeIntent = parseChatTradeIntent({
        message: content,
        activePair: activePair.label,
      });
      if (tradeIntent) {
        setPendingChatTrade(tradeIntent);
        logInfo(
          'chat-trade',
          'Staged order from chat',
          `${tradeIntent.side} ${tradeIntent.size} ${tradeIntent.pair} ${tradeIntent.type}`,
        );
        setChatMessages((messages) =>
          appendChatMessage(
            messages,
            'assistant',
            buildTradeIntentConfirmationMessage({
              intent: tradeIntent,
              networkLabel: network.label,
              priceLabel,
            }),
          ),
        );
        return;
      }

      const reply = await requestAgentChat({
        messages: nextMessages,
        context: {
          pairLabel: activePair.label,
          priceLabel,
          resolutionLabel,
          walletUnlocked: true,
        },
      });
      setChatMessages((messages) =>
        appendChatMessage(messages, 'assistant', reply),
      );
    } catch (error) {
      if (pendingChatTrade) {
        logOrderError(error);
      }

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
    } finally {
      setIsChatLoading(false);
    }
  }

  useInput((input, key) => {
    if (key.tab) {
      setFocusTarget((current) => cycleFocusTarget(current, mode === 'debug'));
      return;
    }

    if (focusTarget === 'chat') {
      if (key.return) {
        void handleChatSubmit();
        return;
      }

      if (key.backspace || key.delete) {
        setChatInput((value) => value.slice(0, -1));
        return;
      }

      if (key.escape) {
        setChatInput('');
        return;
      }

      if (!key.ctrl && !key.meta && input.length > 0) {
        setChatInput((value) => `${value}${input}`);
        return;
      }
    }

    if (focusTarget === 'debug' && mode === 'debug') {
      if (key.backspace || key.delete) {
        setDebugFilter((value) => value.slice(0, -1));
        return;
      }

      if (key.escape) {
        setDebugFilter('');
        return;
      }

      if (!key.ctrl && !key.meta && !key.return && input.length > 0) {
        setDebugFilter((value) => `${value}${input}`);
        return;
      }
    }

    if (input === 'q') {
      exit();
      return;
    }

    const nextPairKind = getPairKindShortcut(input, focusTarget);
    if (nextPairKind) {
      setPairKind(nextPairKind);
      setPairIndex(0);
      return;
    }

    if (focusTarget === 'pairs' && (key.leftArrow || input === 'h')) {
      setPairIndex(
        (value) =>
          (value - 1 + pairGroups[pairKind].length) %
          pairGroups[pairKind].length,
      );
      return;
    }

    if (focusTarget === 'pairs' && (key.rightArrow || input === 'l')) {
      setPairIndex((value) => (value + 1) % pairGroups[pairKind].length);
      return;
    }

    if (focusTarget === 'chart' && input === '[') {
      setResolution((value) => rotateResolution(value, -1));
      return;
    }

    if (focusTarget === 'chart' && input === ']') {
      setResolution((value) => rotateResolution(value, 1));
      return;
    }
  });

  const frameWidth = Math.max(process.stdout.columns ?? 120, 100);
  const frameHeight = Math.max((process.stdout.rows ?? 30) - 1, 28);
  const contentHeight = Math.max(frameHeight - FRAME_PADDING_Y * 2, 20);
  const middleRowHeight = Math.max(
    contentHeight - TOP_BAR_HEIGHT - FOOTER_HEIGHT - BOTTOM_PANEL_HEIGHT,
    10,
  );
  const orderBookHeight = Math.max(Math.floor(middleRowHeight / 3), 8);
  const tradeListHeight = Math.max(
    middleRowHeight - orderBookHeight - PANEL_GAP,
    8,
  );
  const showOrderBookStatus = orderBookHeight >= 10;
  const orderBookDepth = Math.max(
    Math.min(
      7,
      Math.floor((orderBookHeight - (showOrderBookStatus ? 5 : 4)) / 2),
    ),
    1,
  );
  const orderBookRows = useMemo(
    () => buildOrderBookRows(orderbook, orderBookDepth),
    [orderBookDepth, orderbook],
  );
  const chartWidth = Math.max(Math.floor(frameWidth * 0.64) - 15, 28);
  const chartHeight = Math.max(middleRowHeight - 5, 8);
  const chatBodyHeight = Math.max(middleRowHeight - CHAT_INPUT_HEIGHT - 2, 4);

  return (
    <Box
      flexDirection="column"
      width={frameWidth}
      height={frameHeight}
      paddingX={1}
      paddingY={FRAME_PADDING_Y}
    >
      <TopBar
        activePair={activePair.label}
        activePrice={priceLabel}
        change24h={change24h}
        focusTarget={focusTarget}
        isOverviewConnected={isOverviewConnected}
        network={network}
        overview={overview}
        pairGroups={pairGroups}
        pairIndex={pairIndex}
        pairKind={pairKind}
        walletAddress={walletAddress}
      />
      <Box height={middleRowHeight} marginTop={PANEL_GAP}>
        <Panel
          title="Candle Chart"
          borderColor={focusTarget === 'chart' ? 'yellow' : 'gray'}
          height={middleRowHeight}
          width="64%"
          marginRight={PANEL_GAP}
        >
          <CandleChart
            candles={candles}
            changeColor={(change24h ?? 0) < 0 ? DOWN_COLOR : UP_COLOR}
            changeLabel={formatPercent(change24h)}
            height={chartHeight}
            lastPriceLabel={priceLabel}
            pairLabel={activePair.label}
            resolution={resolution}
            resolutionLabel={resolutions
              .map(
                (item) =>
                  `${resolution === item ? '>' : ' '} ${formatResolution(item)}`,
              )
              .join('  ')}
            streamStatus={candleStreamStatus}
            width={chartWidth}
          />
          {candleError ? <Text color={DOWN_COLOR}>{candleError}</Text> : null}
        </Panel>
        <Box width="36%" height={middleRowHeight} flexDirection="row">
          <Box width="42%" flexDirection="column" marginRight={PANEL_GAP}>
            <Panel
              title="Orderbook"
              borderColor={focusTarget === 'orderbook' ? 'yellow' : 'gray'}
              height={orderBookHeight}
            >
              <Text color="gray">PRICE SIZE TOTAL</Text>
              {getStableKeys(orderBookRows.asks).map(({ key, value }) => (
                <Text key={key} color={value ? DOWN_COLOR : undefined}>
                  {value || ' '}
                </Text>
              ))}
              <Text backgroundColor="gray" color="black">
                {` MID ${priceLabel} `}
              </Text>
              {getStableKeys(orderBookRows.bids).map(({ key, value }) => (
                <Text key={key} color={value ? UP_COLOR : undefined}>
                  {value || ' '}
                </Text>
              ))}
              {showOrderBookStatus ? (
                <Text color="gray">
                  {isOrderbookConnected
                    ? 'Streaming orderbook'
                    : 'Connecting orderbook...'}
                </Text>
              ) : null}
              {showOrderBookStatus && orderbookError ? (
                <Text color={DOWN_COLOR}>{orderbookError}</Text>
              ) : null}
            </Panel>
            <Panel
              title="Trades"
              borderColor={focusTarget === 'trades' ? 'yellow' : 'gray'}
              marginTop={PANEL_GAP}
              height={tradeListHeight}
            >
              <Text color="gray">TIME PRICE SIZE</Text>
              {getStableKeys(buildTradeRows(trades)).map(({ key, value }) => (
                <Text
                  key={key}
                  color={
                    value.includes(' BUY ')
                      ? UP_COLOR
                      : value.includes(' SELL ')
                        ? DOWN_COLOR
                        : 'white'
                  }
                >
                  {value}
                </Text>
              ))}
            </Panel>
          </Box>
          <Panel
            title="AGENT"
            borderColor={focusTarget === 'chat' ? 'yellow' : 'gray'}
            width="58%"
            height={middleRowHeight}
          >
            <Box flexDirection="column" flexGrow={1}>
              <Box flexDirection="column" height={chatBodyHeight}>
                {visibleChatMessages.map((message) => (
                  <Text
                    key={message.id}
                    color={
                      message.role === 'assistant'
                        ? CHAT_ASSISTANT_COLOR
                        : CHAT_USER_COLOR
                    }
                  >
                    {message.role === 'assistant' ? 'AI> ' : 'You> '}
                    {message.content}
                  </Text>
                ))}
                {isChatLoading ? (
                  <Text color={CHAT_ASSISTANT_COLOR}>
                    AI&gt; {getChatLoadingMessage(chatLoadingFrame)}
                  </Text>
                ) : null}
              </Box>
              <Text color="gray">--------------------------------</Text>
              <Text color={focusTarget === 'chat' ? 'yellow' : 'gray'}>
                {formatChatComposerLine(chatInput, focusTarget)}
              </Text>
              <Text color="gray">
                {isChatLoading
                  ? getChatLoadingMessage(chatLoadingFrame)
                  : `Enter send Backspace edit Esc clear`}
              </Text>
            </Box>
          </Panel>
        </Box>
      </Box>
      <Box height={BOTTOM_PANEL_HEIGHT} marginTop={PANEL_GAP}>
        {mode === 'debug' ? (
          <>
            <Box width="48%" marginRight={PANEL_GAP}>
              <PositionsPanel
                height={BOTTOM_PANEL_HEIGHT}
                overview={overview}
                pairs={pairGroups.perp}
                positions={perpPositions}
              />
            </Box>
            <Box width="52%">
              <DebugPanel
                filterQuery={debugFilter}
                height={BOTTOM_PANEL_HEIGHT}
                isFocused={focusTarget === 'debug'}
              />
            </Box>
          </>
        ) : (
          <PositionsPanel
            height={BOTTOM_PANEL_HEIGHT}
            overview={overview}
            pairs={pairGroups.perp}
            positions={perpPositions}
          />
        )}
      </Box>
      <Panel borderColor="gray" height={FOOTER_HEIGHT}>
        <Box justifyContent="space-between">
          <Text color={getWebSocketDelayTone(websocketDelayMs)}>
            {`WS delay ${formatWebSocketDelay(websocketDelayMs)}`}
          </Text>
          <Text color="gray">{`DEEPX v${CLI_VERSION}  ${mode}`}</Text>
        </Box>
      </Panel>
    </Box>
  );
};

type TopBarProps = {
  network: NetworkConfig;
  walletAddress: string;
  pairKind: PairKind;
  pairIndex: number;
  activePair: string;
  activePrice: string;
  change24h?: number;
  focusTarget: FocusTarget;
  pairGroups: Record<PairKind, { label: string }[]>;
  overview: Record<string, { latestPrice?: number; priceChange24h?: number }>;
  isOverviewConnected: boolean;
};

const TopBar: FC<TopBarProps> = ({
  network,
  walletAddress,
  pairKind,
  pairIndex,
  activePair,
  activePrice,
  change24h,
  focusTarget,
  pairGroups,
  overview,
  isOverviewConnected,
}) => {
  return (
    <Panel
      title="Markets"
      borderColor={focusTarget === 'pairs' ? 'yellow' : 'gray'}
      height={TOP_BAR_HEIGHT}
    >
      <Box justifyContent="space-between">
        <Box>
          <Tag label="PERP" isActive={pairKind === 'perp'} />
          <Text> </Text>
          {pairGroups.perp.map((pair, index) => (
            <PairTag
              key={pair.label}
              label={buildPairLabel(
                pair.label,
                overview[pair.label]?.latestPrice,
                pairKind === 'perp' && pairIndex === index,
              )}
              isActive={pairKind === 'perp' && pairIndex === index}
            />
          ))}
          <Text> </Text>
          <Tag label="SPOT" isActive={pairKind === 'spot'} />
          <Text> </Text>
          {pairGroups.spot.map((pair, index) => (
            <PairTag
              key={pair.label}
              label={buildPairLabel(
                pair.label,
                overview[pair.label]?.latestPrice,
                pairKind === 'spot' && pairIndex === index,
              )}
              isActive={pairKind === 'spot' && pairIndex === index}
            />
          ))}
        </Box>
        <Box flexDirection="column" alignItems="flex-end">
          <Text color="yellow">{network.shortLabel}</Text>
          <Text color="gray">{truncateMiddle(walletAddress)}</Text>
        </Box>
      </Box>
      <Text>
        {activePair} {activePrice}{' '}
        <Text color={(change24h ?? 0) < 0 ? DOWN_COLOR : UP_COLOR}>
          {formatPercent(change24h)}
        </Text>
        <Text color="gray">
          {isOverviewConnected ? '  live' : '  connecting...'}
        </Text>
      </Text>
    </Panel>
  );
};

type PanelProps = {
  title?: string;
  borderColor: 'yellow' | 'gray';
  children: ReactNode;
  height?: number;
  width?: string;
  marginTop?: number;
  marginRight?: number;
};

const Panel: FC<PanelProps> = ({
  title,
  borderColor,
  children,
  height,
  width,
  marginTop,
  marginRight,
}) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
      height={height}
      width={width}
      marginTop={marginTop}
      marginRight={marginRight}
      flexGrow={width ? 0 : 1}
    >
      {title ? (
        <Text color={borderColor === 'yellow' ? 'yellow' : 'gray'}>
          {title}
        </Text>
      ) : null}
      {children}
    </Box>
  );
};

type TagProps = {
  label: string;
  isActive: boolean;
};

const Tag: FC<TagProps> = ({ label, isActive }) => {
  return (
    <Text
      color={isActive ? 'black' : 'gray'}
      backgroundColor={isActive ? 'green' : undefined}
    >
      {` ${label} `}
    </Text>
  );
};

type PairTagProps = {
  label: string;
  isActive: boolean;
};

const PairTag: FC<PairTagProps> = ({ label, isActive }) => {
  return (
    <Text
      color={isActive ? 'black' : 'white'}
      backgroundColor={isActive ? 'yellow' : undefined}
    >
      {` ${label} `}
    </Text>
  );
};

function buildOrderBookRows(
  orderbook: {
    orderSellList?: { price: string; qty: string; value: string }[];
    orderBuyList?: { price: string; qty: string; value: string }[];
  } | null,
  depth: number,
) {
  if (!orderbook) {
    return {
      asks: padRows(['Waiting for asks...'], depth, 'end'),
      bids: padRows(['Waiting for bids...'], depth, 'start'),
    };
  }

  const asks = [...(orderbook.orderSellList ?? [])]
    .slice(0, depth)
    .reverse()
    .map((item) => formatOrderBookRow(item));

  const bids = [...(orderbook.orderBuyList ?? [])]
    .slice(0, depth)
    .map((item) => formatOrderBookRow(item));

  return {
    asks: padRows(asks, depth, 'end'),
    bids: padRows(bids, depth, 'start'),
  };
}

function padRows(
  rows: string[],
  depth: number,
  align: 'start' | 'end',
): string[] {
  if (rows.length >= depth) {
    return rows.slice(0, depth);
  }

  const blanks = Array.from({ length: depth - rows.length }, () => '');
  return align === 'end' ? [...blanks, ...rows] : [...rows, ...blanks];
}

function formatOrderBookRow(item: {
  price: string;
  qty: string;
  value: string;
}): string {
  const price = formatCompactDecimal(item.price, 2);
  const qty = formatCompactDecimal(item.qty, 3);
  const value = formatCompactDecimal(item.value, 2);

  return `${padRight(price, 9)}${padRight(qty, 8)}${value}`;
}

function formatCompactDecimal(value: string | number, digits: number): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '--';
  }

  return numericValue.toFixed(digits);
}

function buildTradeRows(
  trades: {
    price: string | number;
    qty?: string | number;
    filledQty?: string | number;
    amount?: string | number;
    size?: string | number;
    filledDirection?: string;
    isLong?: boolean;
    createdAt?: string;
    time?: string | number;
  }[],
): string[] {
  if (trades.length === 0) {
    return ['Waiting for trades...'];
  }

  return trades.slice(0, 20).map((trade) => {
    const timeLabel = formatTradeTime(trade.createdAt ?? trade.time);
    const side = trade.isLong ? 'BUY' : 'SELL';
    const priceLabel = formatDecimal(trade.price, 2);
    const sizeLabel = formatDecimal(resolveTradeSize(trade), 3);
    return `${padRight(timeLabel, 6)} ${padRight(side, 4)} ${padRight(
      priceLabel,
      8,
    )} ${sizeLabel}`;
  });
}

function formatPercent(value?: number): string {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function buildPairLabel(
  label: string,
  latestPrice?: number,
  isActive?: boolean,
): string {
  if (latestPrice == null || !Number.isFinite(latestPrice) || isActive) {
    return label;
  }

  return `${label} ${latestPrice.toFixed(2)}`;
}

function rotateResolution(current: string, direction: -1 | 1): string {
  const index = resolutions.indexOf(current);
  return (
    resolutions[
      (index + direction + resolutions.length) % resolutions.length
    ] ?? '15'
  );
}

function formatResolution(value: string): string {
  switch (value) {
    case '1':
      return '1m';
    case '5':
      return '5m';
    case '15':
      return '15m';
    case '30':
      return '30m';
    case '60':
      return '1h';
    case '240':
      return '4h';
    case '1D':
      return '1D';
    case '1W':
      return '1W';
    case '1M':
      return '1M';
    default:
      return value;
  }
}

function logOrderError(error: unknown) {
  logError('chat-trade', 'Order failure', formatErrorMessage(error));
  process.stderr.write(`[deepx order error] ${formatErrorWithStack(error)}\n`);
}

function getStableKeys(values: string[]): { key: string; value: string }[] {
  const counts = new Map<string, number>();
  return values.map((value) => {
    const nextCount = (counts.get(value) ?? 0) + 1;
    counts.set(value, nextCount);
    return {
      key: `${value}-${nextCount}`,
      value,
    };
  });
}

function formatTradeTime(value?: string | number): string {
  if (value == null) {
    return '--:--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function resolveTradeSize(trade: {
  qty?: string | number;
  filledQty?: string | number;
  amount?: string | number;
  size?: string | number;
}): string | number | undefined {
  return trade.qty ?? trade.filledQty ?? trade.amount ?? trade.size;
}

function formatDecimal(
  value: string | number | undefined,
  digits: number,
): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '--';
  }

  return numericValue.toFixed(digits);
}
