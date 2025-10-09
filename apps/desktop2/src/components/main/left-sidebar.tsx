import { clsx } from "clsx";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { PanelLeftCloseIcon } from "lucide-react";
import React from "react";
import { useCell } from "tinybase/ui-react";

import * as persisted from "../../tinybase/store/persisted";

import { ContextMenuItem } from "@hypr/ui/components/ui/context-menu";
import { useLeftSidebar } from "@hypr/utils/contexts";
import { useTabs } from "../../hooks/useTabs";
import { Tab } from "../../types";
import { InteractiveButton } from "../interactive-button";

export function LeftSidebar() {
  const { togglePanel: toggleLeftPanel } = useLeftSidebar();

  return (
    <div className="h-full border-r w-full flex flex-col overflow-hidden">
      <header
        data-tauri-drag-region
        className={clsx([
          "flex flex-row shrink-0",
          "flex w-full items-center justify-between min-h-11 py-1 px-2 border-b",
          "border-border bg-neutral-50",
          "pl-[72px]",
        ])}
      >
        <PanelLeftCloseIcon
          onClick={toggleLeftPanel}
          className="cursor-pointer h-5 w-5"
        />
      </header>

      <TimelineView />
    </div>
  );
}

type TimelineItemData = {
  id: string;
  type: "event" | "session";
  eventId?: string;
  timestamp: string;
};

function TimelineView() {
  const eventSliceIds = persisted.UI.useSliceIds(persisted.INDEXES.eventsByDate, persisted.STORE_ID);
  const sessionResultTable = persisted.UI.useResultTable(
    persisted.QUERIES.timelineSessions,
    persisted.STORE_ID,
  );
  const { currentTab } = useTabs();

  // Build timeline items by date
  const itemsByDate = React.useMemo(() => {
    const byDate: Record<string, TimelineItemData[]> = {};

    // Add sessions
    if (sessionResultTable) {
      Object.entries(sessionResultTable).forEach(([sessionId, row]) => {
        const displayDate = row.display_date as string;
        const eventId = row.event_id as string | undefined;
        const timestamp = row.display_timestamp as string;

        if (!byDate[displayDate]) {
          byDate[displayDate] = [];
        }

        byDate[displayDate].push({
          id: sessionId,
          type: "session",
          eventId,
          timestamp,
        });
      });
    }

    // Sort items within each date by timestamp (most recent first)
    Object.keys(byDate).forEach((date) => {
      byDate[date].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });

    return byDate;
  }, [sessionResultTable]);

  // Add event-only items separately (events without sessions)
  const sessionsWithEvents = React.useMemo(() => {
    return new Set(
      Object.values(sessionResultTable || {})
        .map((row) => row.event_id as string | undefined)
        .filter((id): id is string => !!id),
    );
  }, [sessionResultTable]);

  // Merge dates from sessions and events, sort (most recent first)
  const allDates = React.useMemo(() => {
    const dates = new Set([
      ...Object.keys(itemsByDate),
      ...(eventSliceIds || []),
    ]);
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [itemsByDate, eventSliceIds]);

  return (
    <div className="flex flex-col overflow-y-auto">
      {allDates.map((date) => (
        <DateSection
          key={date}
          date={date}
          currentTab={currentTab}
          items={itemsByDate[date] || []}
          sessionsWithEvents={sessionsWithEvents}
        />
      ))}
    </div>
  );
}

function DateSection(
  { date, currentTab, items, sessionsWithEvents }: {
    date: string;
    currentTab?: Tab;
    items: TimelineItemData[];
    sessionsWithEvents: Set<string>;
  },
) {
  const dateObj = new Date(date);
  const displayDate = isToday(dateObj)
    ? "Today"
    : isYesterday(dateObj)
    ? "Yesterday"
    : format(dateObj, "EEEE, MMMM d, yyyy");

  // Get event-only items for this date (events without sessions)
  const eventIds = persisted.UI.useSliceRowIds(persisted.INDEXES.eventsByDate, date, persisted.STORE_ID);
  const store = persisted.UI.useStore(persisted.STORE_ID);

  const eventOnlyItems = React.useMemo(() => {
    const eventItems: TimelineItemData[] = [];

    eventIds?.forEach((eventId) => {
      if (!sessionsWithEvents.has(eventId)) {
        const startedAt = store?.getCell("events", eventId, "started_at") as string | undefined;

        if (startedAt) {
          eventItems.push({
            id: eventId,
            type: "event",
            timestamp: startedAt,
          });
        }
      }
    });

    return eventItems;
  }, [eventIds, sessionsWithEvents, store]);

  // Merge and sort all items
  const allItems = React.useMemo(() => {
    const merged = [...items, ...eventOnlyItems];
    return merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [items, eventOnlyItems]);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 bg-neutral-100 px-3 py-2 text-xs font-semibold text-muted-foreground border-b">
        {displayDate}
      </div>
      <div className="flex flex-col">
        {allItems.map((item) => {
          const isActive = item.type === "session"
            ? currentTab?.type === "sessions" && currentTab?.id === item.id
            : currentTab?.type === "events" && currentTab?.id === item.id;

          return (
            <TimelineItem
              key={`${item.type}-${item.id}`}
              item={item}
              active={isActive}
            />
          );
        })}
      </div>
    </div>
  );
}

function TimelineItem({ item, active }: { item: TimelineItemData; active?: boolean }) {
  const { openCurrent, openNew } = useTabs();

  // Fetch data based on item type
  const sessionTitle = useCell("sessions", item.type === "session" ? item.id : "", "title", persisted.STORE_ID);
  const eventTitle = useCell(
    "events",
    item.eventId || (item.type === "event" ? item.id : ""),
    "title",
    persisted.STORE_ID,
  );

  // Determine display title based on the three cases
  let displayTitle = "";
  let handleClick: () => void;
  let handleCmdClick: () => void;
  let contextMenuLabel = "";

  if (item.type === "session") {
    // Session-only or session with event
    displayTitle = sessionTitle as string || eventTitle as string || "Untitled";
    const tab: Tab = { id: item.id, type: "sessions", active: false };
    handleClick = () => openCurrent(tab);
    handleCmdClick = () => openNew(tab);
    contextMenuLabel = "session";
  } else {
    // Event-only - no session exists yet
    displayTitle = eventTitle as string || "Untitled";
    // TODO: Implement create session + attach event functionality
    handleClick = () => {};
    handleCmdClick = () => {};
    contextMenuLabel = "event";
  }

  // Format time display
  const timestamp = new Date(item.timestamp);
  const now = new Date();
  const hoursDiff = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);

  let timeDisplay = "";
  if (hoursDiff < 24) {
    // Show time for items within last 24 hours
    timeDisplay = format(timestamp, "h:mm a");
  } else {
    // Show relative time for older items
    timeDisplay = formatDistanceToNow(timestamp, { addSuffix: true });
  }

  const contextMenu = (
    <>
      <ContextMenuItem onClick={() => console.log(`Delete ${contextMenuLabel}:`, item.id)}>
        Delete
      </ContextMenuItem>
    </>
  );

  return (
    <InteractiveButton
      onClick={handleClick}
      onCmdClick={handleCmdClick}
      contextMenu={contextMenu}
      className={clsx([
        "w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100",
        active && "bg-blue-100",
      ])}
    >
      <div className="flex flex-col min-w-0">
        <div className="text-sm font-medium truncate">{displayTitle}</div>
        <div className="text-xs text-muted-foreground">{timeDisplay}</div>
      </div>
    </InteractiveButton>
  );
}
