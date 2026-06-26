export type CalendarCell = {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateForInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toDateTimeLocalValueFromParts(date: string, time: string): string {
  return `${date}T${time}`;
}

export function buildMonthCalendar(year: number, monthIndex: number): CalendarCell[] {
  const firstDate = new Date(year, monthIndex, 1);
  const firstDay = firstDate.getDay();
  const gridStart = new Date(year, monthIndex, 1 - firstDay);
  const today = formatDateForInput(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const date = formatDateForInput(cellDate);

    return {
      date,
      day: cellDate.getDate(),
      isCurrentMonth: cellDate.getMonth() === monthIndex,
      isToday: date === today
    };
  });
}
