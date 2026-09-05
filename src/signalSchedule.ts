export type CronScheduleMode = "daily" | "weekdays" | "weekly" | "monthly" | "advanced";

export interface CronScheduleEditorValue {
  mode: CronScheduleMode;
  time: string;
  weekday: string;
  monthDay: number;
  advancedExpression: string;
}

export const DEFAULT_CRON_SCHEDULE: CronScheduleEditorValue = {
  mode: "weekdays",
  time: "09:00",
  weekday: "1",
  monthDay: 1,
  advancedExpression: "0 9 * * 1-5",
};

export const CRON_WEEKDAYS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
] as const;

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const INTEGER_PATTERN = /^\d+$/;

function splitTime(value: string): { hour: number; minute: number } | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function cronFieldIsValid(value: string, minimum: number, maximum: number): boolean {
  if (!value) return false;
  return value.split(",").every((part) => {
    const [rangePart, stepPart, ...extra] = part.split("/");
    if (extra.length > 0) return false;
    if (stepPart !== undefined && (!INTEGER_PATTERN.test(stepPart) || Number(stepPart) < 1)) {
      return false;
    }
    if (rangePart === "*") return true;
    const bounds = rangePart.split("-");
    if (bounds.length > 2 || bounds.some((bound) => !INTEGER_PATTERN.test(bound))) {
      return false;
    }
    const numbers = bounds.map(Number);
    return numbers.every((number) => number >= minimum && number <= maximum)
      && (numbers.length === 1 || numbers[0] <= numbers[1]);
  });
}

export function isValidCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const limits = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ] as const;
  return fields.every((field, index) => {
    const [minimum, maximum] = limits[index];
    return cronFieldIsValid(field, minimum, maximum);
  });
}

export function buildCronExpression(value: CronScheduleEditorValue): string {
  if (value.mode === "advanced") return value.advancedExpression.trim();
  const time = splitTime(value.time);
  if (!time) return "";
  const prefix = `${time.minute} ${time.hour}`;
  if (value.mode === "daily") return `${prefix} * * *`;
  if (value.mode === "weekdays") return `${prefix} * * 1-5`;
  if (value.mode === "weekly") return `${prefix} * * ${value.weekday}`;
  return `${prefix} ${value.monthDay} * *`;
}

export function parseCronExpression(expression: string): CronScheduleEditorValue {
  const normalized = expression.trim().replace(/\s+/g, " ");
  const fields = normalized.split(" ");
  if (fields.length !== 5) {
    return { ...DEFAULT_CRON_SCHEDULE, mode: "advanced", advancedExpression: normalized };
  }
  const [minuteValue, hourValue, monthDay, month, weekday] = fields;
  const minute = Number(minuteValue);
  const hour = Number(hourValue);
  const simpleTime = INTEGER_PATTERN.test(minuteValue)
    && INTEGER_PATTERN.test(hourValue)
    && minute >= 0
    && minute <= 59
    && hour >= 0
    && hour <= 23;
  if (!simpleTime || month !== "*") {
    return { ...DEFAULT_CRON_SCHEDULE, mode: "advanced", advancedExpression: normalized };
  }
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (monthDay === "*" && weekday === "*") {
    return { ...DEFAULT_CRON_SCHEDULE, mode: "daily", time, advancedExpression: normalized };
  }
  if (monthDay === "*" && weekday === "1-5") {
    return { ...DEFAULT_CRON_SCHEDULE, mode: "weekdays", time, advancedExpression: normalized };
  }
  if (monthDay === "*" && CRON_WEEKDAYS.some((day) => day.value === weekday)) {
    return {
      ...DEFAULT_CRON_SCHEDULE,
      mode: "weekly",
      time,
      weekday,
      advancedExpression: normalized,
    };
  }
  if (weekday === "*" && INTEGER_PATTERN.test(monthDay)) {
    const parsedMonthDay = Number(monthDay);
    if (parsedMonthDay >= 1 && parsedMonthDay <= 31) {
      return {
        ...DEFAULT_CRON_SCHEDULE,
        mode: "monthly",
        time,
        monthDay: parsedMonthDay,
        advancedExpression: normalized,
      };
    }
  }
  return { ...DEFAULT_CRON_SCHEDULE, mode: "advanced", advancedExpression: normalized };
}

export function describeCronSchedule(value: CronScheduleEditorValue): string {
  if (value.mode === "advanced") {
    return isValidCronExpression(value.advancedExpression)
      ? "Custom calendar schedule"
      : "Enter a valid five-field crontab expression";
  }
  const time = splitTime(value.time);
  if (!time) return "Choose a valid time";
  const formattedTime = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
  if (value.mode === "daily") return `Every day at ${formattedTime}`;
  if (value.mode === "weekdays") return `Monday through Friday at ${formattedTime}`;
  if (value.mode === "weekly") {
    const weekday = CRON_WEEKDAYS.find((day) => day.value === value.weekday)?.label ?? "selected day";
    return `Every ${weekday} at ${formattedTime}`;
  }
  return `Day ${value.monthDay} of every month at ${formattedTime}`;
}
